import { ARC, BASE, IRIS } from "./profiles";
import type { Observation } from "./casefile";
export const validHash = (h: string) => /^0x[0-9a-fA-F]{64}$/.test(h);
export function createTransport(
  fetcher: typeof fetch = fetch,
  options: {
    timeoutMs?: number;
    maxRequests?: number;
    maxBytes?: number;
    totalMs?: number;
  } = {},
) {
  const {
    timeoutMs = 8000,
    maxRequests = 6,
    maxBytes = 1_048_576,
    totalMs = 40_000,
  } = options;
  let count = 0;
  const started = Date.now();
  const observation = (
    status: string,
    provenance: string,
    value: any = null,
    extra: any = {},
  ): Observation => ({
    status,
    observedAt: new Date().toISOString(),
    provenance,
    value,
    ...extra,
  });
  async function request(url: string, body?: any): Promise<Observation> {
    if (count >= maxRequests) return observation("budget_exhausted", url);
    const remaining = totalMs - (Date.now() - started);
    if (remaining <= 0) return observation("budget_exhausted", url);
    count++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        const response = await fetcher(url, {
          method: body ? "POST" : "GET",
          body: body ? JSON.stringify(body) : undefined,
          headers: body
            ? { "Content-Type": "application/json" }
            : { Accept: "application/json" },
          signal: controller.signal,
          credentials: "omit",
          // workerd supports manual, not error; never follow another origin.
          redirect: "manual",
        });
        if (response.status >= 300 && response.status < 400)
          return observation(`http_${response.status}`, url, null, {
            httpStatus: response.status,
            error: "redirect_refused",
          });
        if (!response.ok)
          return observation(`http_${response.status}`, url, null, {
            httpStatus: response.status,
          });
        if (Number(response.headers.get("content-length")) > maxBytes)
          return observation("response_too_large", url);
        const reader = response.body?.getReader();
        if (!reader) return observation("invalid_json", url);
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maxBytes) {
            await reader.cancel();
            return observation("response_too_large", url);
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
        let parsed: any;
        try {
          parsed = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          return observation("invalid_json", url);
        }
        if (body) {
          if (
            parsed === null ||
            typeof parsed !== "object" ||
            Array.isArray(parsed) ||
            parsed.jsonrpc !== "2.0" ||
            !Number.isSafeInteger(parsed.id) ||
            parsed.id !== body.id ||
            Object.hasOwn(parsed, "result") === Object.hasOwn(parsed, "error")
          )
            return observation("invalid_rpc_response", url, parsed);
          if (Object.hasOwn(parsed, "error")) {
            if (
              parsed.error === null ||
              typeof parsed.error !== "object" ||
              Array.isArray(parsed.error) ||
              !Number.isSafeInteger(parsed.error.code) ||
              typeof parsed.error.message !== "string"
            )
              return observation("invalid_rpc_response", url, parsed);
            return observation("rpc_error", url, null, {
              error: JSON.stringify(parsed.error),
            });
          }
          if (
            ["eth_chainId", "eth_blockNumber"].includes(body.method) &&
            (typeof parsed.result !== "string" ||
              !/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(parsed.result))
          )
            return observation("invalid_rpc_response", url, parsed);
          return observation(
            parsed.result === null &&
              body.method === "eth_getTransactionReceipt"
              ? "null_receipt"
              : "ok",
            url,
            parsed.result,
          );
        }
        return observation("ok", url, parsed, { httpStatus: response.status });
      })();
      return await Promise.race([
        work,
        new Promise<Observation>((resolve) => {
          timer = setTimeout(
            () => {
              controller.abort();
              resolve(observation("timeout", url));
            },
            Math.min(timeoutMs, remaining),
          );
        }),
      ]);
    } catch (e) {
      return observation(
        controller.signal.aborted ? "timeout" : "network_error",
        url,
        null,
        { error: (e as Error).message.slice(0, 300) },
      );
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }
  async function rpc(network: string, method: string, params: any[]) {
    if (network !== "base" && network !== "arc")
      throw Error("unsupported_network");
    if (
      !["eth_chainId", "eth_getTransactionReceipt", "eth_blockNumber"].includes(
        method,
      )
    )
      throw Error("unsupported_read_method");
    if (
      method === "eth_getTransactionReceipt"
        ? params.length !== 1 || !validHash(params[0])
        : params.length !== 0
    )
      throw Error("invalid_rpc_parameters");
    return request(network === "base" ? BASE.rpc : ARC.rpc, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });
  }
  async function iris(hash: string) {
    if (!validHash(hash)) throw Error("invalid_source_hash");
    return request(`${IRIS}/v2/messages/6?transactionHash=${hash}`);
  }
  return { rpc, iris, requestCount: () => count };
}
