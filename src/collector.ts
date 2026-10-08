import { createTransport, validHash } from "./transport";
import { eq } from "./message";
import type { Input, Observation } from "./casefile";
export async function collect(
  sourceHash: string,
  destinationHash?: string,
  logIndex?: number,
  transport = createTransport(),
): Promise<Input> {
  if (
    !validHash(sourceHash) ||
    (destinationHash && !validHash(destinationHash)) ||
    (logIndex !== undefined &&
      (!Number.isSafeInteger(logIndex) || logIndex < 0))
  )
    throw Error("invalid_case_parameters");
  const skipped = (): Observation => ({
    status: "not_requested",
    observedAt: new Date().toISOString(),
    provenance: "local://coverage",
    value: null,
  });
  const [sourceChain, destinationChain] = await Promise.all([
    transport.rpc("base", "eth_chainId", []),
    transport.rpc("arc", "eth_chainId", []),
  ]);
  const input: Input = {
    mode: "live",
    sourceHash,
    destinationHash,
    logIndex,
    sourceChain,
    destinationChain,
    source: skipped(),
    iris: skipped(),
    destination: skipped(),
    head: skipped(),
  };
  if (
    sourceChain.status !== "ok" ||
    destinationChain.status !== "ok" ||
    !eq(sourceChain.value, "0x2105") ||
    !eq(destinationChain.value, "0x13b2")
  )
    return input;
  input.source = await transport.rpc("base", "eth_getTransactionReceipt", [
    sourceHash,
  ]);
  if (input.source.status !== "ok" || input.source.value?.status !== "0x1")
    return input;
  [input.iris, input.head, input.destination] = await Promise.all([
    transport.iris(sourceHash),
    transport.rpc("arc", "eth_blockNumber", []),
    destinationHash
      ? transport.rpc("arc", "eth_getTransactionReceipt", [destinationHash])
      : Promise.resolve(skipped()),
  ]);
  return input;
}
