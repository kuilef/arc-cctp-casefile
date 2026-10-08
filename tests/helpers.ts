import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { ABI } from "../src/abi";
import { ARC, BASE, MT, TM } from "../src/profiles";
export const hash = (c: string) => `0x${c.repeat(64)}` as Hex;
export const address = (c: string) => `0x${c.repeat(40)}` as Hex;
export const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}` as Hex;
export const zero = pad("0x0");
const num = (v: number | bigint, n: number) =>
  BigInt(v)
    .toString(16)
    .padStart(n * 2, "0");
export function message(o: Record<string, any> = {}): Hex {
  const v = {
    version: 1,
    sourceDomain: 6,
    destinationDomain: 26,
    nonce: zero,
    sender: pad(TM),
    recipient: pad(TM),
    destinationCaller: zero,
    minFinalityThreshold: 1000,
    finalityThresholdExecuted: 0,
    bodyVersion: 1,
    burnToken: pad(BASE.token),
    mintRecipient: pad(address("a")),
    amount: 10000000n,
    messageSender: pad(address("b")),
    maxFee: 10000n,
    feeExecuted: 0n,
    expirationBlock: 0n,
    hookData: "0x",
    ...o,
  };
  return `0x${num(v.version, 4)}${num(v.sourceDomain, 4)}${num(v.destinationDomain, 4)}${v.nonce.slice(2)}${v.sender.slice(2)}${v.recipient.slice(2)}${v.destinationCaller.slice(2)}${num(v.minFinalityThreshold, 4)}${num(v.finalityThresholdExecuted, 4)}${num(v.bodyVersion, 4)}${v.burnToken.slice(2)}${v.mintRecipient.slice(2)}${num(v.amount, 32)}${v.messageSender.slice(2)}${num(v.maxFee, 32)}${num(v.feeExecuted, 32)}${num(v.expirationBlock, 32)}${v.hookData.slice(2)}` as Hex;
}
export function event(
  name: string,
  args: Record<string, any>,
  index: number,
  source = true,
) {
  const abi = ABI.find((x) => x.name === name);
  if (!abi) throw Error("unknown_test_event");
  const fields = abi.inputs.filter((x) => !("indexed" in x && x.indexed));
  const data = encodeAbiParameters(
    fields,
    fields.map((x) => args[x.name]) as any,
  );
  return {
    address:
      name === "MessageSent" || name === "MessageReceived"
        ? MT
        : name === "Transfer"
          ? source
            ? BASE.token
            : ARC.token
          : TM,
    topics: encodeEventTopics({
      abi: ABI,
      eventName: name as any,
      args,
    } as any),
    data,
    logIndex: `0x${index.toString(16)}`,
    transactionHash: hash(source ? "1" : "2"),
    blockHash: hash(source ? "3" : "4"),
    blockNumber: "0x64",
    removed: false,
  };
}
export function receipt(logs: any[], source = true) {
  return {
    transactionHash: hash(source ? "1" : "2"),
    blockHash: hash(source ? "3" : "4"),
    blockNumber: "0x64",
    status: "0x1",
    logs,
  };
}
export const obs = (value: any, status = "ok") => ({
  status,
  value,
  observedAt: "2026-10-08T21:00:00.000Z",
  provenance: "synthetic://fixture",
});
export function fixture(overrides: Record<string, any> = {}) {
  const s = message(overrides);
  const a = message({
    ...overrides,
    nonce: hash("c"),
    finalityThresholdExecuted: 1000,
    feeExecuted: 1000n,
    expirationBlock: 500n,
  });
  const deposit = event(
    "DepositForBurn",
    {
      burnToken: BASE.token,
      amount: overrides.amount ?? 10000000n,
      depositor: address("b"),
      mintRecipient: overrides.mintRecipient ?? pad(address("a")),
      destinationDomain: overrides.destinationDomain ?? 26,
      destinationTokenMessenger: pad(TM),
      destinationCaller: overrides.destinationCaller ?? zero,
      maxFee: 10000n,
      minFinalityThreshold: 1000,
      hookData: "0x",
    },
    2,
  );
  const received = event(
    "MessageReceived",
    {
      caller: address("d"),
      sourceDomain: 6,
      nonce: hash("c"),
      sender: pad(TM),
      finalityThresholdExecuted: 1000,
      messageBody: `0x${a.slice(2 + 148 * 2)}`,
    },
    5,
    false,
  );
  const minted = event(
    "MintAndWithdraw",
    {
      mintRecipient: address("a"),
      amount: 9999000n,
      mintToken: ARC.token,
      feeCollected: 1000n,
    },
    4,
    false,
  );
  return {
    mode: "fixture",
    sourceHash: hash("1"),
    destinationHash: hash("2"),
    sourceChain: obs("0x2105"),
    destinationChain: obs("0x13b2"),
    source: obs(receipt([event("MessageSent", { message: s }, 1), deposit])),
    iris: obs({
      sourceTxHash: hash("1"),
      messages: [
        {
          message: a,
          attestation: `0x${"ab".repeat(65)}`,
          cctpVersion: 2,
          status: "complete",
        },
      ],
    }),
    destination: obs(receipt([minted, received], false)),
    head: obs("0x64"),
    ...{},
  };
}
