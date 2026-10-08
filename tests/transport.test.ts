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
test("bounded request budget stops requests", async () => {
  const t = createTransport(async () => Response.json({ result: "0x2105" }), {
    maxRequests: 1,
  });
  await t.rpc("base", "eth_chainId", []);
  assert.equal(
    (await t.rpc("base", "eth_chainId", [])).status,
    "budget_exhausted",
  );
});
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
    Response.json({ error: { code: -32000, message: "down" } }),
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
    return Response.json({ result: "0x2105" });
  });
  await t.rpc("base", "eth_chainId", []);
  assert.equal(url, "https://mainnet.base.org");
  assert.equal(opts.credentials, "omit");
  assert.equal(opts.redirect, "error");
});
