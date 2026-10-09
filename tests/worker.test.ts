import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, type WorkerEnv } from "../src/worker";
import { collect } from "../src/collector";
import { createTransport } from "../src/transport";
const hash = `0x${"1".repeat(64)}`;
const other = `0x${"2".repeat(64)}`;
function env(): WorkerEnv {
  return {
    LIVE_ENABLED: "true",
    CASE_IP: { limit: async () => ({ success: true }) },
    CASE_LOCATION: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("static") },
  };
}
function request(query = `source=${hash}`, extra: Record<string, string> = {}) {
  return new Request(`https://demo.example/api/case?${query}`, {
    headers: { "Sec-Fetch-Site": "same-origin", "CF-Connecting-IP": "192.0.2.1", ...extra },
  });
}
test("Worker rejects invalid, duplicate and cross-origin input before any collection", async () => {
  let calls = 0;
  const worker = createWorker(async (...args) => { calls++; return collect(...args); });
  for (const query of ["source=no", `source=${hash}&source=${hash}`,
    `source=${hash}&url=https://example.org`, `source=${hash}&destination=`,
    `source=${hash}&logIndex=-1`, `source=${hash}&logIndex=999999999`]) {
    assert.equal((await worker.fetch(request(query), env())).status, 400);
  }
  assert.equal((await worker.fetch(request(undefined, { Origin: "https://evil.example" }), env())).status, 403);
  assert.equal(calls, 0);
});
test("Worker fails closed when disabled or rate bindings are unavailable or deny", async () => {
  let calls = 0;
  const worker = createWorker(async (...args) => { calls++; return collect(...args); });
  const disabled = env(); disabled.LIVE_ENABLED = "false";
  assert.equal((await worker.fetch(request(), disabled)).status, 503);
  const missing = env(); delete missing.CASE_IP;
  assert.equal((await worker.fetch(request(), missing)).status, 503);
  const denied = env(); denied.CASE_IP = { limit: async () => ({ success: false }) };
  const response = await worker.fetch(request(), denied);
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "90");
  const broken = env(); broken.CASE_LOCATION = { limit: async () => { throw Error("unavailable"); } };
  assert.equal((await worker.fetch(request(), broken)).status, 503);
  assert.equal(calls, 0);
});
test("Worker preserves real collector observations and six fixed upstream reads", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "omit");
    if (String(url).startsWith("https://iris-api.circle.com/v2/messages/6?transactionHash=")) {
      return Response.json({ messages: [] });
    }
    const payload = JSON.parse(String(init?.body));
    const result = payload.method === "eth_chainId"
      ? String(url) === "https://mainnet.base.org" ? "0x2105" : "0x13b2"
      : payload.method === "eth_blockNumber" ? "0x64"
      : { status: "0x1", transactionHash: payload.params[0], logs: [] };
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
  const worker = createWorker((a, b, c) => collect(a, b, c, createTransport(fetcher)));
  const response = await worker.fetch(request(`source=${hash}&destination=${other}`), env());
  assert.equal(response.status, 200);
  const input = await response.json();
  assert.equal(input.mode, "live"); assert.equal(input.source.status, "ok");
  assert.equal(input.iris.provenance, `https://iris-api.circle.com/v2/messages/6?transactionHash=${hash}`);
  assert.equal(urls.length, 6);
  assert.ok(urls.every(url => ["https://mainnet.base.org", "https://rpc.mainnet.arc.io"].includes(url) ||
    url === `https://iris-api.circle.com/v2/messages/6?transactionHash=${hash}`));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("Static requests do not collect or consume rate bindings", async () => {
  const response = await createWorker().fetch(new Request("https://demo.example/"), env());
  assert.equal(await response.text(), "static");
});

test("Method rejection advertises Allow and collection capacity is released after failures", async () => {
  const post = new Request("https://demo.example/api/case", { method: "POST" });
  assert.equal((await createWorker().fetch(post, env())).headers.get("Allow"), "GET");
  let attempts = 0;
  const worker = createWorker(async () => { attempts++; throw Error("failed"); });
  for (let i = 0; i < 4; i++) assert.equal((await worker.fetch(request(), env())).status, 503);
  assert.equal(attempts, 4);
});
test("Upstream 429 and null remain evidence inside a 200 collection", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).startsWith("https://iris-api.circle.com/")) return new Response("", { status: 429 });
    const payload = JSON.parse(String(init?.body));
    const result = payload.method === "eth_chainId"
      ? String(url) === "https://mainnet.base.org" ? "0x2105" : "0x13b2"
      : payload.method === "eth_blockNumber" ? "0x64"
      : String(url) === "https://mainnet.base.org" ? { status: "0x1", logs: [] } : null;
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
  const worker = createWorker((a, b, c) => collect(a, b, c, createTransport(fetcher)));
  const response = await worker.fetch(request(`source=${hash}&destination=${other}`), env());
  assert.equal(response.status, 200);
  const input = await response.json();
  assert.equal(input.iris.status, "http_429");
  assert.equal(input.destination.status, "null_receipt");
});

test("Pages KV cooldown denies repeat collection and fails closed on storage errors", async () => {
  let writes = 0, calls = 0, gate: string | null = null;
  const pages = env(); delete pages.CASE_IP; delete pages.CASE_LOCATION;
  pages.RATE_GATE = {
    get: async () => gate,
    put: async (key, value, options) => {
      assert.equal(key, "casefile-cooldown"); assert.equal(options.expirationTtl, 90);
      gate = value; writes++;
    },
  };
  const worker = createWorker(async () => { calls++; throw Error("collector failure"); });
  assert.equal((await worker.fetch(request(), pages)).status, 503);
  assert.equal((await worker.fetch(request(), pages)).status, 429);
  assert.equal(writes, 1); assert.equal(calls, 1);
  pages.RATE_GATE.get = async () => { throw Error("quota exhausted"); };
  assert.equal((await worker.fetch(request(), pages)).status, 503);
  assert.equal(calls, 1);
});

test("Stalled or rejected KV admission performs zero upstream collection and releases capacity", async () => {
  let calls = 0;
  const worker = createWorker(async () => { calls++; throw Error("must not collect"); });
  for (const failure of ["get-stall", "put-stall", "put-reject"]) {
    const pages = env(); delete pages.CASE_IP; delete pages.CASE_LOCATION;
    pages.RATE_GATE = {
      get: async () => failure === "get-stall" ? new Promise<string | null>(() => {}) : null,
      put: async () => {
        if (failure === "put-stall") return new Promise<void>(() => {});
        throw Error("write rejected");
      },
    };
    assert.equal((await worker.fetch(request(), pages)).status, 503);
  }
  const closed = env(); closed.CASE_IP = { limit: async () => ({ success: false }) };
  assert.equal((await worker.fetch(request(), closed)).status, 429);
  assert.equal(calls, 0);
});
