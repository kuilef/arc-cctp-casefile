import { collect } from "./collector";
import { createTransport, validHash } from "./transport";

interface Limiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
export interface WorkerEnv {
  LIVE_ENABLED?: string;
  CASE_IP?: Limiter;
  CASE_LOCATION?: Limiter;
  RATE_GATE?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
function send(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: status === 429 ? { ...headers, "Retry-After": "90" } :
      status === 405 ? { ...headers, Allow: "GET" } : headers,
  });
}
async function boundedGate<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(Error("abuse_gate_timeout")), 2000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
// Per-isolate guard supplements the platform bindings; it is not a global lock.
const collectPublic: typeof collect = (source, destination, logIndex) =>
  collect(source, destination, logIndex, createTransport(fetch, { maxBytes: 131072 }));
export function createWorker(collector: typeof collect = collectPublic) {
  let active = 0;
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      if (url.pathname !== "/api/case") return send(404, { error: "not_found" });
      if (request.method !== "GET") return send(405, { error: "get_only" });
      if (request.url.length > 1024) return send(400, { error: "request_too_large" });
      // Headers prevent drive-by browser collection, not a spoof-resistant identity.
      const origin = request.headers.get("Origin");
      const site = request.headers.get("Sec-Fetch-Site");
      if ((origin !== null && origin !== url.origin) ||
          (site !== null && site !== "same-origin") ||
          (origin === null && site !== "same-origin")) {
        return send(403, { error: "same_origin_required" });
      }
      const keys = [...url.searchParams.keys()];
      const source = url.searchParams.get("source") ?? "";
      const destination = url.searchParams.get("destination");
      const index = url.searchParams.get("logIndex");
      if (keys.some(k => !["source", "destination", "logIndex"].includes(k)) ||
          new Set(keys).size !== keys.length || !validHash(source) ||
          (destination !== null && !validHash(destination)) ||
          (index !== null && !/^\d{1,8}$/.test(index))) {
        return send(400, { error: "invalid_case_parameters" });
      }
      if (env.LIVE_ENABLED !== "true") return send(503, { error: "live_collection_disabled" });
      // Missing/error bindings fail closed. Never fall back to an in-memory rate limit.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip || (!(env.CASE_IP && env.CASE_LOCATION) && !env.RATE_GATE)) {
        return send(503, { error: "abuse_protection_unavailable" });
      }
      if (active >= 2) return send(429, { error: "collection_capacity" });
      active++;
      try {
        if (env.CASE_IP && env.CASE_LOCATION) {
          if (!(await boundedGate(env.CASE_IP.limit({ key: ip }))).success ||
              !(await boundedGate(env.CASE_LOCATION.limit({ key: "case-collection" }))).success) {
            return send(429, { error: "collection_rate_limit" });
          }
        } else if (env.RATE_GATE) {
          // Pages supports KV, not Rate Limiting bindings. This is an eventually
          // consistent cooldown, not an atomic global lock or exact usage counter.
          // No transaction hash or IP is stored. Any KV failure closes collection.
          if (await boundedGate(env.RATE_GATE.get("casefile-cooldown"))) {
            return send(429, { error: "demo_cooldown" });
          }
          await boundedGate(env.RATE_GATE.put("casefile-cooldown", "1", { expirationTtl: 90 }));
        } else {
          return send(503, { error: "abuse_protection_unavailable" });
        }
        const input = await collector(
          source.toLowerCase(),
          destination?.toLowerCase(),
          index === null ? undefined : Number(index),
        );
        return send(200, input);
      } catch {
        return send(503, { error: "collection_unavailable" });
      } finally {
        active--;
      }
    },
  };
}
export default createWorker();
