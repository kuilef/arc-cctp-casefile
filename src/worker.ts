import { collect } from "./collector";
import type { Input } from "./casefile";
import { createTransport, validHash } from "./transport";

interface Limiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
export interface WorkerEnv {
  LIVE_ENABLED?: string;
  BASE_RPC_PROVIDER?: string;
  CASE_IP?: Limiter;
  CASE_LOCATION?: Limiter;
  RATE_GATE?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>;
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
function send(status: number, value: unknown, retryAfter = 90) {
  return new Response(JSON.stringify(value), {
    status,
    headers: status === 429 ? { ...headers, "Retry-After": String(retryAfter) } :
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
const gateKey = "casefile-cooldown";
const minimumCooldown = 90;
const maximumCooldown = 86_400;
type Cooldown = { v: 1; until: number } | { v: 1; blocked: true };
const blockedCooldown: Cooldown = { v: 1, blocked: true };
function readCooldown(value: string | null): Cooldown | null {
  if (value === null) return null;
  // The previous version stored a 90-second marker without a timestamp.
  if (value === "1") return { v: 1, until: Date.now() + minimumCooldown * 1000 };
  try {
    const parsed = JSON.parse(value);
    if (parsed?.v === 1 && parsed.blocked === true) return blockedCooldown;
    if (parsed?.v === 1 && Number.isSafeInteger(parsed.until) && parsed.until >= 0)
      return { v: 1, until: parsed.until };
  } catch { /* Unknown/corrupt markers fail closed; never delete them. */ }
  return blockedCooldown;
}
function mergeCooldown(a: Cooldown | null, b: Cooldown): Cooldown {
  if ((a && "blocked" in a) || "blocked" in b) return blockedCooldown;
  return { v: 1, until: Math.max(a?.until ?? 0, b.until) };
}
function upstreamCooldown(input: Input): Cooldown | null {
  let cooldown: Cooldown | null = null;
  for (const observation of [input.sourceChain, input.destinationChain, input.source,
    input.iris, input.destination, input.head]) {
    if (observation.httpStatus !== 429 && observation.httpStatus !== 503) continue;
    const observed = Date.parse(observation.observedAt);
    if (!Number.isFinite(observed)) return blockedCooldown;
    let seconds = minimumCooldown;
    const raw = observation.retryAfter;
    if (raw !== undefined) {
      if (/^\d+$/.test(raw)) seconds = Number(raw);
      else {
        // HTTP's preferred IMF-fixdate only: round-trip validation rejects JS's
        // permissive date repairs, mismatched weekdays and non-HTTP date formats.
        const date = Date.parse(raw);
        if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw) ||
            !Number.isFinite(date) || new Date(date).toUTCString() !== raw)
          return blockedCooldown;
        seconds = Math.max(0, Math.ceil((date - observed) / 1000));
      }
      // Never clamp longer/invalid provider guidance to a shorter automatic wait.
      if (!Number.isSafeInteger(seconds) || seconds > maximumCooldown) return blockedCooldown;
    }
    cooldown = mergeCooldown(cooldown, {
      v: 1, until: observed + Math.max(minimumCooldown, seconds) * 1000,
    });
  }
  return cooldown;
}
// Per-isolate guard supplements the platform bindings; it is not a global lock.
export function createWorker(collector: typeof collect = collect) {
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
      let transport: ReturnType<typeof createTransport>;
      try {
        transport = createTransport(fetch, { maxBytes: 131072, baseRpcProvider: env.BASE_RPC_PROVIDER });
      } catch {
        return send(503, { error: "invalid_base_rpc_provider" });
      }
      // Shared KV is mandatory, including with platform limiters, so upstream
      // cooldowns cannot silently disappear on the optional Workers route.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip || !env.RATE_GATE) {
        return send(503, { error: "abuse_protection_unavailable" });
      }
      if (active >= 2) return send(429, { error: "collection_capacity" });
      active++;
      try {
        const cooldown = readCooldown(await boundedGate(env.RATE_GATE.get(gateKey)));
        if (cooldown) {
          if ("blocked" in cooldown) return send(503, { error: "upstream_cooldown_requires_operator" });
          return send(429, { error: "demo_cooldown" }, Math.max(1, Math.ceil((cooldown.until - Date.now()) / 1000)));
        }
        if (env.CASE_IP && env.CASE_LOCATION) {
          if (!(await boundedGate(env.CASE_IP.limit({ key: ip }))).success ||
              !(await boundedGate(env.CASE_LOCATION.limit({ key: "case-collection" }))).success) {
            return send(429, { error: "collection_rate_limit" });
          }
        }
        // KV is eventually consistent: this is a cooldown, not an atomic lock.
        // The marker contains no transaction hash, IP or provider response data.
        await boundedGate(env.RATE_GATE.put(gateKey,
          JSON.stringify({ v: 1, until: Date.now() + minimumCooldown * 1000 }),
          { expirationTtl: minimumCooldown }));
        const admittedAt = Date.now();
        const input = await collector(
          source.toLowerCase(),
          destination?.toLowerCase(),
          index === null ? undefined : Number(index),
          transport,
        );
        const upstream = upstreamCooldown(input);
        if (upstream) {
          // KV permits one write per second per key. Space our own two writes
          // from completion of admission; add at most 1100 ms, never retry reads.
          const wait = Math.max(0, 1100 - (Date.now() - admittedAt));
          if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
          // Preserve longer/blocked markers visible after concurrent collection.
          // KV offers no compare-and-swap, so stale reads/racing writes remain possible.
          const current = readCooldown(await boundedGate(env.RATE_GATE.get(gateKey)));
          const cooldown = mergeCooldown(current, upstream);
          await boundedGate(env.RATE_GATE.put(gateKey, JSON.stringify(cooldown),
            "blocked" in cooldown ? undefined : {
              expirationTtl: Math.max(60, Math.ceil((cooldown.until - Date.now()) / 1000)),
            }));
        }
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
