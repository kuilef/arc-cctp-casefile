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
export default {
  async test(_ctrl, env) {
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
    if (
      ![
        "https://mainnet.base.org",
        "https://rpc.mainnet.arc.io",
        "https://iris-api.circle.com",
      ].includes(url.origin)
    )
      throw Error("redirect target or unexpected upstream requested");
    if (request.headers.has("Cookie") || request.headers.has("Authorization"))
      throw Error("unexpected credentials");
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
        ? url.origin === "https://mainnet.base.org"
          ? "0x2105"
          : "0x13b2"
        : payload.method === "eth_blockNumber"
          ? "0x64"
          : { status: "0x1", transactionHash: payload.params[0], logs: [] };
    return Response.json({ jsonrpc: "2.0", id: payload.id, result });
  },
};
