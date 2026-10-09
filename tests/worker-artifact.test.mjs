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

for (const [provider, bytes] of [["base-public", 131072], ["base-public", 131073], ["publicnode", 131072], ["publicnode", 131073]]) {
  test(`Compiled ${provider} Worker enforces ${bytes}-byte streamed upstream boundary`, async () => {
    const endpoint = provider === "publicnode" ? "https://base-rpc.publicnode.com" : "https://mainnet.base.org";
    const oldFetch = globalThis.fetch;
    let calls = 0,
      cancelled = false;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init.redirect, "manual");
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
        [endpoint, "https://rpc.mainnet.arc.io"].includes(
          String(url),
        ),
      );
      const payload = JSON.parse(init.body);
      if (payload.method === "eth_chainId")
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: String(url) === endpoint ? "0x2105" : "0x13b2",
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
      const response = await worker.fetch(request(), { ...env(), BASE_RPC_PROVIDER: provider });
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

test("Compiled Worker rejects upstream redirects as evidence before collecting receipts", async () => {
  const oldFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    return new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/private" },
    });
  };
  try {
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, 200);
    const input = await response.json();
    for (const chain of [input.sourceChain, input.destinationChain]) {
      assert.equal(chain.status, "http_302");
      assert.equal(chain.httpStatus, 302);
      assert.equal(chain.error, "redirect_refused");
      assert.equal(chain.value, null);
    }
    assert.deepEqual(urls.sort(), [
      "https://mainnet.base.org",
      "https://rpc.mainnet.arc.io",
    ]);
    assert.equal(input.source.status, "not_requested");
    assert.equal(input.iris.status, "not_requested");
    assert.equal(input.destination.status, "not_requested");
    assert.equal(input.head.status, "not_requested");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

for (const provider of [undefined, "base-public", "publicnode"]) {
  test(`Compiled Worker ${provider ?? "default"} provider has one fixed Base origin and six read-only requests`, async () => {
    const oldFetch = globalThis.fetch;
    const endpoint = provider === "publicnode" ? "https://base-rpc.publicnode.com" : "https://mainnet.base.org";
    const urls = [];
    globalThis.fetch = async (url, init) => {
      urls.push(String(url));
      assert.equal(init.redirect, "manual"); assert.equal(init.credentials, "omit");
      assert.ok([endpoint, "https://rpc.mainnet.arc.io", `https://iris-api.circle.com/v2/messages/6?transactionHash=${source}`].includes(String(url)));
      if (String(url).includes("iris-api")) { assert.equal(init.method, "GET"); return Response.json({ messages: [] }); }
      assert.equal(init.method, "POST");
      const payload = JSON.parse(init.body);
      assert.ok(["eth_chainId", "eth_getTransactionReceipt", "eth_blockNumber"].includes(payload.method));
      const result = payload.method === "eth_chainId" ? String(url) === endpoint ? "0x2105" : "0x13b2" : payload.method === "eth_blockNumber" ? "0x64" : { status: "0x1", transactionHash: payload.params[0], logs: [] };
      return Response.json({ jsonrpc: "2.0", id: payload.id, result });
    };
    try {
      const response = await worker.fetch(request(), { ...env(), BASE_RPC_PROVIDER: provider });
      assert.equal(response.status, 200);
      const input = await response.json();
      assert.equal(input.sourceChain.provenance, endpoint); assert.equal(input.source.provenance, endpoint);
      assert.equal(input.source.status, "ok"); assert.equal(input.destination.status, "ok");
      assert.equal(urls.length, 6); assert.equal(urls.filter(url => url === endpoint).length, 2);
    } finally { globalThis.fetch = oldFetch; }
  });
}
test("Compiled Worker unknown provider fails closed before all upstream or gate work", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("must not fetch"); };
  try {
    for (const provider of ["", "publicnode ", "PUBLICNODE", "__proto__", "https://evil.example"]) {
      const configured = { ...env(), BASE_RPC_PROVIDER: provider, RATE_GATE: { get: async () => { calls++; return null; }, put: async () => { calls++; } } };
      const response = await worker.fetch(request(), configured);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "invalid_base_rpc_provider" });
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; }
});
for (const [status, guidance] of [[429, "180"], [503, new Date(Date.now() + 300_000).toUTCString()], [429, "invalid"], [503, "86401"]]) {
  test(`Compiled Worker HTTP ${status}/${guidance} preserves evidence, writes bounded cooldown and never retries`, async () => {
    const oldFetch = globalThis.fetch;
    const urls = [], writes = [];
    let marker = null, lastWrite = 0;
    const configured = { ...env(), BASE_RPC_PROVIDER: "publicnode", RATE_GATE: { get: async () => marker, put: async (_key, value, options) => {
      if (lastWrite && Date.now() - lastWrite < 1000) throw Error("KV same-key write rate limit");
      marker = value; writes.push(options); lastWrite = Date.now();
    } } };
    globalThis.fetch = async (url, init) => {
      urls.push(String(url));
      assert.equal(init.redirect, "manual");
      return String(url) === "https://base-rpc.publicnode.com" ? new Response(null, { status, headers: { "Retry-After": guidance } }) : Response.json({ jsonrpc: "2.0", id: 1, result: "0x13b2" });
    };
    try {
      const response = await worker.fetch(request(), configured);
      assert.equal(response.status, 200);
      const input = await response.json();
      assert.equal(input.sourceChain.status, `http_${status}`); assert.equal(input.sourceChain.retryAfter, guidance);
      assert.equal(input.sourceChain.provenance, "https://base-rpc.publicnode.com");
      assert.equal(input.source.status, "not_requested");
      assert.deepEqual(urls, ["https://base-rpc.publicnode.com", "https://rpc.mainnet.arc.io"]);
      assert.equal(writes.length, 2);
      const denied = await worker.fetch(request(), configured);
      const blocked = guidance === "invalid" || guidance === "86401";
      assert.equal(denied.status, blocked ? 503 : 429);
      if (blocked) assert.equal(writes[1]?.expirationTtl, undefined);
      else assert.ok(writes[1].expirationTtl >= 179 && writes[1].expirationTtl <= 300);
      assert.equal(urls.length, 2);
    } finally { globalThis.fetch = oldFetch; }
  });
}

test("Compiled publicnode Worker preserves chain-ID checks and stops after mismatched chain evidence", async () => {
  const oldFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(JSON.parse(init.body).method, "eth_chainId");
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" });
  };
  try {
    const response = await worker.fetch(request(), { ...env(), BASE_RPC_PROVIDER: "publicnode" });
    assert.equal(response.status, 200);
    const input = await response.json();
    assert.equal(input.sourceChain.value, "0x1");
    assert.equal(input.sourceChain.provenance, "https://base-rpc.publicnode.com");
    for (const key of ["source", "iris", "destination", "head"]) assert.equal(input[key].status, "not_requested");
    assert.deepEqual(urls, ["https://base-rpc.publicnode.com", "https://rpc.mainnet.arc.io"]);
  } finally { globalThis.fetch = oldFetch; }
});
