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
    RATE_GATE: { get: async () => null, put: async () => {} },
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
    `source=${hash}&logIndex=-1`, `source=${hash}&logIndex=999999999`,
    `source=${hash}&BASE_RPC_PROVIDER=publicnode`, `source=${hash}&baseRpcProvider=publicnode`]) {
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
  const missing = env(); delete missing.CASE_IP; delete missing.RATE_GATE;
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
      assert.equal(key, "casefile-cooldown"); assert.equal(options?.expirationTtl, 90);
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

function pagesGate(initial: string | null = null) {
  const pages = env(); delete pages.CASE_IP; delete pages.CASE_LOCATION;
  let marker = initial;
  const writes: { value: string; options?: { expirationTtl?: number } }[] = [];
  pages.RATE_GATE = {
    get: async () => marker,
    put: async (key, value, options) => {
      assert.equal(key, "casefile-cooldown");
      marker = value; writes.push({ value, options });
    },
  };
  return { pages, writes, marker: () => marker };
}
function limitedCollector(status: number, retryAfter?: string, observedAt = new Date().toISOString()): typeof collect {
  return async (sourceHash) => {
    const skipped = { status: "not_requested", observedAt, provenance: "local://coverage", value: null };
    return {
      mode: "live", sourceHash,
      sourceChain: { status: `http_${status}`, httpStatus: status, observedAt, provenance: "https://base-rpc.publicnode.com", value: null, ...(retryAfter === undefined ? {} : { retryAfter }) },
      destinationChain: { ...skipped }, source: { ...skipped }, iris: { ...skipped }, destination: { ...skipped }, head: { ...skipped },
    };
  };
}
test("Worker deployment provider defaults are fixed and publicnode reaches the real collector", async () => {
  const oldFetch = globalThis.fetch;
  try {
    for (const [provider, endpoint] of [[undefined, "https://mainnet.base.org"], ["base-public", "https://mainnet.base.org"], ["publicnode", "https://base-rpc.publicnode.com"]]) {
      const urls: string[] = [];
      globalThis.fetch = async (url, init) => {
        urls.push(String(url));
        const payload = JSON.parse(String(init?.body));
        if (payload.method === "eth_chainId") return Response.json({ jsonrpc: "2.0", id: 1, result: String(url) === endpoint ? "0x2105" : "0x13b2" });
        return Response.json({ jsonrpc: "2.0", id: 1, result: null });
      };
      const configured = env(); configured.BASE_RPC_PROVIDER = provider;
      const response = await createWorker().fetch(request(), configured);
      assert.equal(response.status, 200);
      const input = await response.json();
      assert.equal(input.sourceChain.provenance, endpoint);
      assert.equal(input.source.provenance, endpoint);
      assert.deepEqual(urls, [endpoint, "https://rpc.mainnet.arc.io", endpoint]);
    }
  } finally { globalThis.fetch = oldFetch; }
});
test("unknown deployment provider fails closed before KV, rate bindings or collection", async () => {
  let calls = 0;
  const worker = createWorker(async () => { calls++; throw Error("must not collect"); });
  for (const provider of ["", "PUBLICNODE", "__proto__", "https://base-rpc.publicnode.com"]) {
    const configured = env(); configured.BASE_RPC_PROVIDER = provider;
    configured.CASE_IP = { limit: async () => { calls++; throw Error("must not gate"); } };
    const response = await worker.fetch(request(), configured);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "invalid_base_rpc_provider" });
  }
  assert.equal(calls, 0);
});
for (const status of [429, 503]) {
  for (const guidance of ["120", "86400", new Date(Date.now() + 300_000).toUTCString()]) {
    test(`Worker HTTP ${status} honors valid Retry-After ${guidance} in the global KV marker`, async () => {
      const gate = pagesGate();
      const worker = createWorker(limitedCollector(status, guidance));
      const response = await worker.fetch(request(), gate.pages);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).sourceChain.retryAfter, guidance);
      assert.equal(gate.writes.length, 2);
      const expected = /^\d+$/.test(guidance) ? Number(guidance) : Math.ceil((Date.parse(guidance) - Date.now()) / 1000);
      const ttl = gate.writes[1].options?.expirationTtl ?? 0;
      assert.ok(ttl >= expected - 1 && ttl <= expected + 1, String(ttl));
      const denied = await worker.fetch(request(), gate.pages);
      assert.equal(denied.status, 429);
      assert.ok(Number(denied.headers.get("Retry-After")) >= expected - 1);
      assert.equal(gate.writes.length, 2);
    });
  }
}
for (const guidance of [undefined, "0", "1", "89", "00090", "Fri, 09 Oct 2020 00:00:00 GMT"]) {
  test(`Worker guidance ${String(guidance)} never shortens the 90-second minimum`, async () => {
    const gate = pagesGate();
    const response = await createWorker(limitedCollector(429, guidance)).fetch(request(), gate.pages);
    assert.equal(response.status, 200);
    assert.ok((gate.writes.at(-1)?.options?.expirationTtl ?? 0) >= 89);
  });
}
for (const guidance of ["", "invalid", "-1", "+120", "1.5", "1e3", "120, 240", "86401", "999999999999999999999999999", "Fri, 30 Feb 2026 10:00:00 GMT", "Sat, 09 Oct 2026 10:00:00 GMT", "2026-10-09T10:00:00Z", "Fri, 09 Oct 2099 10:00:00 GMT"]) {
  test(`Worker refuses invalid or over-limit guidance ${JSON.stringify(guidance)} without an expiring shortcut`, async () => {
    const gate = pagesGate();
    const worker = createWorker(limitedCollector(429, guidance));
    const response = await worker.fetch(request(), gate.pages);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sourceChain.retryAfter, guidance);
    assert.equal(gate.writes.length, 2);
    assert.equal(gate.writes[1].options?.expirationTtl, undefined);
    assert.notEqual(gate.marker(), "1");
    const denied = await worker.fetch(request(), gate.pages);
    assert.equal(denied.status, 503);
    assert.deepEqual(await denied.json(), { error: "upstream_cooldown_requires_operator" });
    assert.equal(denied.headers.get("Retry-After"), null);
    assert.equal(gate.writes.length, 2);
  });
}
test("legacy marker and unknown marker stay closed without overwriting or deleting them", async () => {
  for (const marker of ["1", "corrupt"] ) {
    let calls = 0;
    const gate = pagesGate(marker);
    const response = await createWorker(async () => { calls++; throw Error("must not collect"); }).fetch(request(), gate.pages);
    assert.equal(response.status, marker === "1" ? 429 : 503);
    assert.equal(calls, 0); assert.equal(gate.writes.length, 0);
  }
});
test("KV cooldown is checked even when platform rate-limit bindings are present", async () => {
  const gate = pagesGate("1");
  gate.pages.CASE_IP = env().CASE_IP; gate.pages.CASE_LOCATION = env().CASE_LOCATION;
  let calls = 0;
  const response = await createWorker(async () => { calls++; throw Error("must not collect"); }).fetch(request(), gate.pages);
  assert.equal(response.status, 429); assert.equal(calls, 0);
});
test("KV extension storage failure returns fail-closed 503 rather than successful collection", async () => {
  for (const failure of ["get", "put"]) {
    const gate = pagesGate();
    let gets = 0, puts = 0;
    const original = gate.pages.RATE_GATE;
    assert.ok(original);
    gate.pages.RATE_GATE = {
      get: async key => { if (++gets > 1 && failure === "get") throw Error("quota"); return original.get(key); },
      put: async (key, value, options) => { if (++puts > 1 && failure === "put") throw Error("quota"); return original.put(key, value, options); },
    };
    assert.equal((await createWorker(limitedCollector(429, "300")).fetch(request(), gate.pages)).status, 503);
  }
});
test("KV extension preserves a longer or fail-closed marker visible after concurrent collection", async () => {
  for (const blocked of [false, true]) {
    const gate = pagesGate();
    const collectLimited = limitedCollector(429, "120");
    const worker = createWorker(async (...args) => {
      await gate.pages.RATE_GATE?.put("casefile-cooldown", JSON.stringify(blocked ? { v: 1, blocked: true } : { v: 1, until: Date.now() + 600_000 }), blocked ? undefined : { expirationTtl: 600 });
      return collectLimited(...args);
    });
    assert.equal((await worker.fetch(request(), gate.pages)).status, 200);
    const denied = await worker.fetch(request(), gate.pages);
    assert.equal(denied.status, blocked ? 503 : 429);
    if (!blocked) assert.ok(Number(denied.headers.get("Retry-After")) >= 599);
  }
});

test("every live Worker route requires shared KV before collecting, even with platform limiters", async () => {
  for (const provider of [undefined, "base-public", "publicnode"]) {
    const configured = env(); delete configured.RATE_GATE; configured.BASE_RPC_PROVIDER = provider;
    let calls = 0;
    const worker = createWorker(async (...args) => { calls++; return limitedCollector(429, "300")(...args); });
    const response = await worker.fetch(request(), configured);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "abuse_protection_unavailable" });
    assert.equal(calls, 0);
  }
});

test("fast upstream 429 persists cooldown without violating KV's one same-key write per second", async () => {
  const gate = pagesGate();
  const original = gate.pages.RATE_GATE;
  assert.ok(original);
  let lastCompleted = 0;
  const spacing: number[] = [];
  gate.pages.RATE_GATE = {
    get: key => original.get(key),
    put: async (key, value, options) => {
      const elapsed = Date.now() - lastCompleted;
      if (lastCompleted) {
        spacing.push(elapsed);
        if (elapsed < 1000) throw Error("KV same-key write rate limit");
      }
      await original.put(key, value, options);
      lastCompleted = Date.now();
    },
  };
  const worker = createWorker(limitedCollector(429, "300"));
  const response = await worker.fetch(request(), gate.pages);
  assert.equal(response.status, 200);
  assert.equal(gate.writes.length, 2);
  assert.ok(spacing[0] >= 1000);
  const denied = await worker.fetch(request(), gate.pages);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get("Retry-After")) >= 297);
});
