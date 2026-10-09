// Exercises the compiled module with real workerd Request/fetch/Response APIs.
// Upstreams and KV are synthetic; this does not measure hosted CPU or egress.
import worker from "./worker.js";
const source = `0x${"1".repeat(64)}`;
const destination = `0x${"2".repeat(64)}`;
function equal(actual, expected) {
  if (actual !== expected)
    throw Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}
const calls = [];
let guidanceDate;
function makeRequest() {
  return new Request(`https://casefile.example/api/case?source=${source}&destination=${destination}`, {
    headers: { "Sec-Fetch-Site": "same-origin", "CF-Connecting-IP": "192.0.2.1" },
  });
}
export default {
  async test(_ctrl, env) {
    guidanceDate = new Date(Date.now() + 300_000).toUTCString();
    if (!["success", "redirect"].includes(env.MODE)) {
      let marker = null, lastWrite = 0;
      const writes = [];
      const configured = {
        LIVE_ENABLED: "true",
        BASE_RPC_PROVIDER: env.MODE === "unknown-provider" ? "https://evil.example" : "publicnode",
        RATE_GATE: { get: async () => marker, put: async (_key, value, options) => {
          if (lastWrite && Date.now() - lastWrite < 1000) throw Error("KV same-key write rate limit");
          marker = value; writes.push(options); lastWrite = Date.now();
        } },
        ASSETS: { fetch: async () => new Response("static") },
      };
      const response = await worker.fetch(makeRequest(), configured);
      if (env.MODE === "unknown-provider") {
        equal(response.status, 503);
        equal((await response.json()).error, "invalid_base_rpc_provider");
        equal(calls.length, 0); equal(writes.length, 0);
        return;
      }
      equal(response.status, 200);
      const input = await response.json();
      equal(input.sourceChain.provenance, "https://base-rpc.publicnode.com");
      if (env.MODE === "publicnode") {
        equal(input.sourceChain.status, "ok"); equal(input.source.status, "ok");
        equal(input.source.provenance, "https://base-rpc.publicnode.com");
        equal(input.destination.status, "ok"); equal(calls.length, 6);
      } else {
        const date = env.MODE === "retry-503-date";
        const invalid = env.MODE === "retry-invalid";
        equal(input.sourceChain.status, date ? "http_503" : "http_429");
        equal(input.sourceChain.retryAfter, invalid ? "invalid" : date ? guidanceDate : "180");
        equal(input.source.status, "not_requested"); equal(calls.length, 2);
        equal(writes.length, 2);
        const denied = await worker.fetch(makeRequest(), configured);
        equal(denied.status, invalid ? 503 : 429);
        if (invalid) equal(writes[1]?.expirationTtl, undefined);
        else if (!(Number(denied.headers.get("Retry-After")) >= 179)) throw Error("upstream cooldown was shortened");
        equal(calls.length, 2);
      }
      return;
    }
    const response = await worker.fetch(
      new Request(
        `https://casefile.example/api/case?source=${source}&destination=${destination}`,
        {
          headers: {
            "Sec-Fetch-Site": "same-origin",
            "CF-Connecting-IP": "192.0.2.1",
          },
        },
      ),
      {
        LIVE_ENABLED: "true",
        RATE_GATE: { get: async () => null, put: async () => {} },
        ASSETS: { fetch: async () => new Response("static") },
      },
    );
    equal(response.status, 200);
    const input = await response.json();
    for (const chain of [input.sourceChain, input.destinationChain]) {
      equal(chain.status, env.MODE === "redirect" ? "http_302" : "ok");
      if (env.MODE === "redirect") {
        equal(chain.httpStatus, 302);
        equal(chain.error, "redirect_refused");
        equal(chain.value, null);
      }
    }
    for (const observation of [
      input.source,
      input.iris,
      input.destination,
      input.head,
    ])
      equal(
        observation.status,
        env.MODE === "redirect" ? "not_requested" : "ok",
      );
  },
};
export const upstream = {
  async fetch(request, env) {
    const url = new URL(request.url);
    calls.push(request.url);
    if (
      ![
        ["success", "redirect"].includes(env.MODE) ? "https://mainnet.base.org" : "https://base-rpc.publicnode.com",
        "https://rpc.mainnet.arc.io",
        "https://iris-api.circle.com",
      ].includes(url.origin)
    )
      throw Error("redirect target or unexpected upstream requested");
    if (request.headers.has("Cookie") || request.headers.has("Authorization"))
      throw Error("unexpected credentials");
    if (env.MODE.startsWith("retry-") && url.origin === "https://base-rpc.publicnode.com")
      return new Response(null, {
        status: env.MODE === "retry-503-date" ? 503 : 429,
        headers: { "Retry-After": env.MODE === "retry-invalid" ? "invalid" : env.MODE === "retry-503-date" ? guidanceDate : "180" },
      });
    if (env.MODE === "redirect")
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      });
    if (url.origin === "https://iris-api.circle.com") {
      equal(request.method, "GET");
      equal(url.pathname, "/v2/messages/6");
      equal(url.searchParams.get("transactionHash"), source);
      return Response.json({ messages: [] });
    }
    equal(request.method, "POST");
    const payload = await request.json();
    if (
      !["eth_chainId", "eth_getTransactionReceipt", "eth_blockNumber"].includes(
        payload.method,
      )
    )
      throw Error("unexpected RPC method");
    const result =
      payload.method === "eth_chainId"
        ? ["https://mainnet.base.org", "https://base-rpc.publicnode.com"].includes(url.origin)
          ? "0x2105"
          : "0x13b2"
        : payload.method === "eth_blockNumber"
          ? "0x64"
          : { status: "0x1", transactionHash: payload.params[0], logs: [] };
    return Response.json({ jsonrpc: "2.0", id: payload.id, result });
  },
};
