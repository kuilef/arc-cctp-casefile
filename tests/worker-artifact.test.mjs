import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import worker from "../dist/_worker.js";

const source = `0x${"1".repeat(64)}`;
const destination = `0x${"2".repeat(64)}`;
const request = () =>
  new Request(
    `https://casefile.example/api/case?source=${source}&destination=${destination}`,
    {
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "CF-Connecting-IP": "192.0.2.1",
      },
    },
  );
const env = () => ({
  LIVE_ENABLED: "true",
  RATE_GATE: { get: async () => null, put: async () => {} },
  ASSETS: { fetch: async () => new Response("static") },
});
function envelopeAtBytes(result, bytes) {
  const response = {
    jsonrpc: "2.0",
    id: 1,
    result: { ...result, padding: "" },
  };
  response.result.padding = "x".repeat(
    bytes - Buffer.byteLength(JSON.stringify(response)),
  );
  const text = JSON.stringify(response);
  assert.equal(Buffer.byteLength(text), bytes);
  return text;
}

test("Pages artifact contains module Worker, API-only routing, static CSP and offline assets", async () => {
  assert.deepEqual(
    (await readdir("dist")).sort(),
    [
      "_headers",
      "_routes.json",
      "_worker.js",
      "assets",
      "fixtures",
      "index.html",
    ].sort(),
  );
  assert.deepEqual(JSON.parse(await readFile("dist/_routes.json", "utf8")), {
    version: 1,
    include: ["/api/*"],
    exclude: [],
  });
  const headers = await readFile("dist/_headers", "utf8");
  for (const required of [
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "Cache-Control: no-store",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: no-referrer",
  ])
    assert.ok(headers.includes(required), required);
  assert.equal(typeof worker.fetch, "function");
  const html = await readFile("dist/index.html", "utf8");
  assert.match(html, /src="\/assets\/[^"]+\.js"/);
  assert.doesNotMatch(html, /\/src\/ui\.ts/);
  for (const name of ["completed", "unobserved", "unavailable", "multi"])
    assert.equal(
      JSON.parse(await readFile(`dist/fixtures/${name}.json`, "utf8")).mode,
      "fixture",
    );
});

test("Compiled default Worker fails closed without configuration and serves static without upstream", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("no upstream permitted");
  };
  try {
    const disabled = env();
    disabled.LIVE_ENABLED = "false";
    assert.equal((await worker.fetch(request(), disabled)).status, 503);
    const missing = env();
    delete missing.RATE_GATE;
    assert.equal((await worker.fetch(request(), missing)).status, 503);
    const response = await worker.fetch(
      new Request("https://casefile.example/"),
      env(),
    );
    assert.equal(await response.text(), "static");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

for (const bytes of [131072, 131073]) {
  test(`Compiled public Worker enforces ${bytes}-byte streamed upstream boundary`, async () => {
    const oldFetch = globalThis.fetch;
    let calls = 0,
      cancelled = false;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      if (
        String(url).startsWith(
          "https://iris-api.circle.com/v2/messages/6?transactionHash=",
        )
      ) {
        const value = { messages: [], padding: "" };
        value.padding = "x".repeat(
          131072 - Buffer.byteLength(JSON.stringify(value)),
        );
        const body = JSON.stringify(value);
        assert.equal(Buffer.byteLength(body), 131072);
        return new Response(body);
      }
      assert.ok(
        ["https://mainnet.base.org", "https://rpc.mainnet.arc.io"].includes(
          String(url),
        ),
      );
      const payload = JSON.parse(init.body);
      if (payload.method === "eth_chainId")
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: String(url).includes("base.org") ? "0x2105" : "0x13b2",
        });
      if (payload.method === "eth_blockNumber")
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x64" });
      assert.equal(payload.method, "eth_getTransactionReceipt");
      const raw = envelopeAtBytes(
        { status: "0x1", transactionHash: payload.params[0], logs: [] },
        bytes,
      );
      let sent = 0;
      return new Response(
        new ReadableStream(
          {
            pull(controller) {
              if (sent === raw.length) {
                controller.close();
                return;
              }
              const chunk = raw.slice(sent, sent + 4096);
              sent += chunk.length;
              controller.enqueue(new TextEncoder().encode(chunk));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    };
    try {
      const response = await worker.fetch(request(), env());
      assert.equal(response.status, 200);
      for (const [name, value] of [
        ["Cache-Control", "no-store"],
        ["X-Content-Type-Options", "nosniff"],
        ["Referrer-Policy", "no-referrer"],
      ])
        assert.equal(response.headers.get(name), value);
      assert.ok(
        response.headers
          .get("Content-Security-Policy")
          .includes("default-src 'none'"),
      );
      const input = await response.json();
      assert.equal(
        input.source.status,
        bytes === 131072 ? "ok" : "response_too_large",
      );
      assert.equal(
        input.destination.status,
        bytes === 131072 ? "ok" : "not_requested",
      );
      assert.equal(
        input.iris.status,
        bytes === 131072 ? "ok" : "not_requested",
      );
      assert.equal(calls, bytes === 131072 ? 6 : 3);
      assert.equal(cancelled, bytes > 131072);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
}
