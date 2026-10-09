import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../src/transport";
import { hash } from "./helpers";
test("429 is retained without retry", async () => {
  const t = createTransport(async () => new Response("{}", { status: 429 }));
  assert.equal((await t.iris(hash("1"))).status, "http_429");
  assert.equal(t.requestCount(), 1);
});
test("null receipt is retained", async () => {
  const t = createTransport(async () =>
    Response.json({ jsonrpc: "2.0", id: 1, result: null }),
  );
  assert.equal(
    (await t.rpc("base", "eth_getTransactionReceipt", [hash("1")])).status,
    "null_receipt",
  );
});
for (const [label, response] of [
  ["null", null],
  ["array", [{ jsonrpc: "2.0", id: 1, result: "0x2105" }]],
  ["primitive", "0x2105"],
  ["missing envelope", { result: "0x2105" }],
  ["wrong version", { jsonrpc: "1.0", id: 1, result: "0x2105" }],
  ["wrong id", { jsonrpc: "2.0", id: 999, result: "0x2105" }],
  ["missing id", { jsonrpc: "2.0", result: "0x2105" }],
  ["string id", { jsonrpc: "2.0", id: "1", result: "0x2105" }],
  ["fractional id", { jsonrpc: "2.0", id: 1.5, result: "0x2105" }],
  ["missing result and error", { jsonrpc: "2.0", id: 1 }],
  [
    "both result and error",
    {
      jsonrpc: "2.0",
      id: 1,
      result: "0x2105",
      error: { code: -32000, message: "down" },
    },
  ],
  ["null error", { jsonrpc: "2.0", id: 1, error: null }],
  ["array error", { jsonrpc: "2.0", id: 1, error: [] }],
  [
    "string error code",
    { jsonrpc: "2.0", id: 1, error: { code: "-32000", message: "down" } },
  ],
  [
    "fractional error code",
    { jsonrpc: "2.0", id: 1, error: { code: -32000.5, message: "down" } },
  ],
  ["missing error message", { jsonrpc: "2.0", id: 1, error: { code: -32000 } }],
] as const) {
  test(`RPC ${label} is invalid evidence`, async () => {
    const t = createTransport(async () => Response.json(response));
    assert.equal(
      (await t.rpc("base", "eth_chainId", [])).status,
      "invalid_rpc_response",
    );
  });
}
test("bounded request budget stops requests", async () => {
  const t = createTransport(
    async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x2105" }),
    {
      maxRequests: 1,
    },
  );
  await t.rpc("base", "eth_chainId", []);
  assert.equal(
    (await t.rpc("base", "eth_chainId", [])).status,
    "budget_exhausted",
  );
});
for (const result of [42, { toString: "0x2105" }, "0x", "0x02105"]) {
  test(`chain quantity ${JSON.stringify(result)} is invalid evidence`, async () => {
    const t = createTransport(async () =>
      Response.json({ jsonrpc: "2.0", id: 1, result }),
    );
    assert.equal(
      (await t.rpc("base", "eth_chainId", [])).status,
      "invalid_rpc_response",
    );
  });
}
test("timeout ends stalled requests", async () => {
  const t = createTransport(() => new Promise(() => {}), { timeoutMs: 15 });
  assert.equal((await t.rpc("arc", "eth_chainId", [])).status, "timeout");
});
test("response size is bounded", async () => {
  const t = createTransport(async () => new Response("x".repeat(100)), {
    maxBytes: 10,
  });
  assert.equal((await t.iris(hash("1"))).status, "response_too_large");
});
test("RPC error is retained", async () => {
  const t = createTransport(async () =>
    Response.json({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: "down" },
    }),
  );
  const r = await t.rpc("arc", "eth_chainId", []);
  assert.equal(r.status, "rpc_error");
  assert.equal(r.error, '{"code":-32000,"message":"down"}');
});
test("invalid JSON is retained", async () => {
  const t = createTransport(async () => new Response("invalid"));
  assert.equal((await t.iris(hash("1"))).status, "invalid_json");
});
test("arbitrary origins and signing methods cannot be requested", async () => {
  const t = createTransport();
  await assert.rejects(() => t.rpc("http://127.0.0.1", "eth_chainId", []));
  await assert.rejects(() => t.rpc("arc", "eth_sendRawTransaction", []));
  await assert.rejects(() => t.iris("http://evil"));
});
test("upstream requests omit credentials and refuse redirects", async () => {
  let opts: any;
  let url = "";
  const t = createTransport(async (u: any, o: any) => {
    url = String(u);
    opts = o;
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x2105" });
  });
  await t.rpc("base", "eth_chainId", []);
  assert.equal(url, "https://mainnet.base.org");
  assert.equal(opts.credentials, "omit");
  assert.equal(opts.redirect, "manual");
});

for (const kind of ["rpc", "iris"] as const) {
  test(`${kind} rejects 3xx without reading, following or retrying`, async () => {
    for (const status of [300, 301, 302, 303, 304, 305, 306, 307, 308, 399]) {
      const urls: string[] = [];
      let reads = 0;
      const t = createTransport(
        async (url, init) => {
          urls.push(String(url));
          assert.equal(init?.redirect, "manual");
          assert.equal(init?.credentials, "omit");
          return new Response(
            status === 304
              ? null
              : new ReadableStream(
                  {
                    pull() {
                      reads++;
                      throw Error("redirect body must not be read");
                    },
                  },
                  { highWaterMark: 0 },
                ),
            {
              status,
              headers: { Location: "http://127.0.0.1/private" },
            },
          );
        },
        { maxRequests: 1 },
      );
      const read = () =>
        kind === "rpc" ? t.rpc("base", "eth_chainId", []) : t.iris(hash("1"));
      const result = await read();
      assert.equal(result.status, `http_${status}`);
      assert.equal(result.httpStatus, status);
      assert.equal(result.error, "redirect_refused");
      assert.equal(result.value, null);
      assert.equal(
        result.provenance,
        kind === "rpc"
          ? "https://mainnet.base.org"
          : `https://iris-api.circle.com/v2/messages/6?transactionHash=${hash("1")}`,
      );
      assert.equal(Number.isNaN(Date.parse(result.observedAt)), false);
      assert.deepEqual(urls, [result.provenance]);
      assert.equal(reads, 0);
      assert.equal(t.requestCount(), 1);
      assert.equal((await read()).status, "budget_exhausted");
      assert.equal(urls.length, 1);
    }
  });
}

for (const [provider, endpoint] of [
  [undefined, "https://mainnet.base.org"],
  ["base-public", "https://mainnet.base.org"],
  ["publicnode", "https://base-rpc.publicnode.com"],
] as const) {
  test(`Base provider ${provider ?? "default"} uses one fixed origin for every read`, async () => {
    const urls: string[] = [];
    const t = createTransport(async (url, init) => {
      urls.push(String(url));
      assert.equal(init?.redirect, "manual");
      assert.equal(init?.credentials, "omit");
      const method = JSON.parse(String(init?.body)).method;
      return Response.json({ jsonrpc: "2.0", id: 1, result: method === "eth_chainId" ? "0x2105" : null });
    }, { baseRpcProvider: provider });
    assert.equal((await t.rpc("base", "eth_chainId", [])).provenance, endpoint);
    assert.equal((await t.rpc("base", "eth_getTransactionReceipt", [hash("1")])).provenance, endpoint);
    assert.deepEqual(urls, [endpoint, endpoint]);
  });
}
test("Base provider enum rejects arbitrary URLs, credentials and unknown values without reads", () => {
  let calls = 0;
  for (const provider of ["", "PUBLICNODE", "publicnode ", "__proto__", "constructor", "https://mainnet.base.org", "https://user:secret@base-rpc.publicnode.com"]) {
    assert.throws(() => createTransport(async () => { calls++; return new Response(); }, { baseRpcProvider: provider }), /invalid_base_rpc_provider/);
  }
  assert.equal(calls, 0);
});
for (const status of [429, 503]) {
  for (const guidance of ["120", "Fri, 09 Oct 2026 12:30:00 GMT", "invalid", "9999999999999999999999999999999", ""]) {
    test(`HTTP ${status} retains exact Retry-After ${JSON.stringify(guidance)} without retry or fallback`, async () => {
      const urls: string[] = [];
      const t = createTransport(async url => {
        urls.push(String(url));
        return new Response(null, { status, headers: { "Retry-After": guidance } });
      }, { baseRpcProvider: "publicnode" });
      const observation = await t.rpc("base", "eth_chainId", []);
      assert.equal(observation.status, `http_${status}`);
      assert.equal(observation.httpStatus, status);
      assert.equal(observation.retryAfter, guidance);
      assert.equal(observation.value, null);
      assert.deepEqual(urls, ["https://base-rpc.publicnode.com"]);
      assert.equal(t.requestCount(), 1);
    });
  }
}
test("missing Retry-After remains absent rather than fabricated", async () => {
  const t = createTransport(async () => new Response(null, { status: 429 }));
  assert.equal(Object.hasOwn(await t.rpc("base", "eth_chainId", []), "retryAfter"), false);
});
