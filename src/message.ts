export const ZERO = `0x${"0".repeat(64)}`;
export const as32 = (a: string) =>
  `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
export const eq = (a: unknown, b: unknown) =>
  String(a).toLowerCase() === String(b).toLowerCase();
export function decodeMessage(hex: string) {
  if (!/^0x(?:[0-9a-fA-F]{2}){376,8192}$/.test(hex))
    throw Error("malformed_or_oversized_message");
  const h = hex.slice(2).toLowerCase();
  const bytes = (o: number, n: number) => `0x${h.slice(o * 2, (o + n) * 2)}`;
  const num = (o: number, n: number) => BigInt(bytes(o, n)).toString();
  const evm = (o: number) => {
    const a = bytes(o, 32);
    if (!a.startsWith(`0x${"0".repeat(24)}`)) throw Error("non_evm_address");
    return a;
  };
  const version = Number(num(0, 4)),
    bodyVersion = Number(num(148, 4));
  if (version !== 1 || bodyVersion !== 1)
    throw Error("unsupported_message_version");
  return {
    version,
    sourceDomain: Number(num(4, 4)),
    destinationDomain: Number(num(8, 4)),
    nonce: bytes(12, 32),
    sender: evm(44),
    recipient: evm(76),
    destinationCaller: evm(108),
    minFinalityThreshold: Number(num(140, 4)),
    finalityThresholdExecuted: Number(num(144, 4)),
    bodyVersion,
    burnToken: evm(152),
    mintRecipient: evm(184),
    amount: num(216, 32),
    messageSender: evm(248),
    maxFee: num(280, 32),
    feeExecuted: num(312, 32),
    expirationBlock: num(344, 32),
    hookData: `0x${h.slice(376 * 2)}`,
    body: `0x${h.slice(148 * 2)}`,
  };
}
export type Message = ReturnType<typeof decodeMessage>;
export const IMMUTABLE = [
  "version",
  "sourceDomain",
  "destinationDomain",
  "sender",
  "recipient",
  "destinationCaller",
  "minFinalityThreshold",
  "bodyVersion",
  "burnToken",
  "mintRecipient",
  "amount",
  "messageSender",
  "maxFee",
  "hookData",
] as const;
export function immutableDiff(a: Message, b: Message) {
  return IMMUTABLE.filter((k) => !eq(a[k], b[k]));
}
