import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { evaluate } from "../src/casefile";
import {
  fixture,
  obs,
  hash,
  message,
  event,
  pad,
  address,
  zero,
} from "./helpers";
import { BASE, ARC, TM } from "../src/profiles";
test("recorded public Base-to-Arc evidence replays offline with exact net and fee", async () => {
  const file = JSON.parse(
    await readFile("examples/live-2026-10-08.casefile.json", "utf8"),
  );
  const observed = file.observations[0];
  const analysis = evaluate(observed.input);
  assert.equal(observed.origin, "live-collected");
  assert.equal(analysis.summary, "destination_execution_observed");
  assert.equal(analysis.source.logIndex, 315);
  assert.equal(analysis.source.burnLogIndex, 316);
  assert.equal(analysis.destination.mintLogIndex, 8);
  assert.equal(analysis.destination.receiveLogIndex, 9);
  assert.equal(analysis.destination.gross, "10998900");
  assert.equal(analysis.destination.net, "10998543");
  assert.equal(analysis.destination.fee, "357");
});
test("canonical source burn, bound attestation and destination net/fee evidence", () => {
  const r = evaluate(fixture());
  assert.equal(r.source.status, "proven");
  assert.equal(r.attestation.status, "available");
  assert.equal(r.destination.status, "observed");
  assert.equal(r.destination.net, "9999000");
  assert.equal(r.destination.fee, "1000");
  assert.equal(r.destination.gross, "10000000");
});
test("multiple source messages require an explicit logIndex", () => {
  const f = fixture();
  f.source.value.logs.push(
    event(
      "MessageSent",
      { message: message({ mintRecipient: pad(address("e")) }) },
      7,
    ),
  );
  assert.equal(evaluate(f).source.status, "selection_required");
  assert.equal(evaluate({ ...f, logIndex: 1 }).source.status, "proven");
  assert.equal(evaluate({ ...f, logIndex: 99 }).source.status, "unknown");
});
for (const field of [
  "sourceDomain",
  "destinationDomain",
  "sender",
  "recipient",
  "destinationCaller",
  "minFinalityThreshold",
  "burnToken",
  "mintRecipient",
  "amount",
  "messageSender",
  "maxFee",
  "hookData",
]) {
  test(`Iris immutable ${field} mismatch fails closed`, () => {
    const f = fixture();
    const v: any = {
      nonce: hash("c"),
      feeExecuted: 1000n,
      expirationBlock: 500n,
      finalityThresholdExecuted: 1000,
    };
    v[field] = field.includes("Domain")
      ? 99
      : field === "amount" || field === "maxFee"
        ? 123n
        : field === "minFinalityThreshold"
          ? 2000
          : field === "hookData"
            ? "0xab"
            : pad(address("e"));
    f.iris.value.messages[0].message = message(v);
    assert.notEqual(evaluate(f).destination.status, "observed");
    assert.equal(evaluate(f).attestation.status, "unknown");
  });
}
for (const [key, v] of [
  ["version", 2],
  ["bodyVersion", 2],
  ["destinationDomain", 7],
  ["sourceDomain", 0],
  ["burnToken", pad(address("e"))],
  ["recipient", pad(address("e"))],
]) {
  test(`source rejects unsupported ${key}=${v}`, () => {
    assert.equal(evaluate(fixture({ [key]: v })).source.status, "unknown");
  });
}
test("complete attestation without destination never means delivered", () => {
  const f = fixture();
  f.destination = obs(null, "not_requested");
  assert.equal(evaluate(f).attestation.status, "available");
  assert.equal(evaluate(f).destination.status, "unobserved");
});
test("used nonce alone is insufficient", () => {
  const f: any = fixture();
  f.destination = obs(null, "not_requested");
  f.usedNonce = obs("0x1");
  assert.equal(evaluate(f).destination.status, "unobserved");
});
test("caller restriction must match receive event caller", () => {
  assert.notEqual(
    evaluate(fixture({ destinationCaller: pad(address("e")) })).destination
      .status,
    "observed",
  );
});
test("matching caller restriction is supported", () => {
  assert.equal(
    evaluate(fixture({ destinationCaller: pad(address("d")) })).destination
      .status,
    "observed",
  );
});
test("expiration and unavailable attestation stay distinct", () => {
  const f = fixture();
  f.head = obs("0x1f4");
  assert.equal(evaluate(f).attestation.status, "expired");
  assert.equal(evaluate(f).destination.status, "observed");
  f.iris = obs(null, "http_429");
  assert.equal(evaluate(f).attestation.status, "unavailable");
});
for (const status of ["null_receipt", "timeout", "http_429", "rpc_error"])
  test(`source ${status} is retained`, () => {
    const f = fixture();
    f.source = obs(null, status);
    const r = evaluate(f);
    assert.equal(r.source.status, status);
    assert.equal(r.destination.status, "unobserved");
  });
test("failed source receipt is not proof of burn", () => {
  const f = fixture();
  f.source.value.status = "0x0";
  assert.equal(evaluate(f).source.status, "failed_receipt");
});
test("failed destination receipt is retained", () => {
  const f = fixture();
  f.destination.value.status = "0x0";
  assert.equal(evaluate(f).destination.status, "failed_receipt");
});

for (const which of ["source", "destination"] as const) {
  for (const [label, value] of [
    ["foreign failed receipt", { status: "0x0", transactionHash: hash("f") }],
    ["unidentified failed receipt", { status: "0x0" }],
    ["non-object receipt", false],
    ["array receipt", []],
    ["malformed status", { status: 0 }],
  ] as const) {
    test(`${which} ${label} is unknown, never a proven failure`, () => {
      const f = fixture();
      f[which].value = value;
      assert.equal(evaluate(f)[which].status, "unknown");
    });
  }
  test(`${which} failure requires a canonical hash even when requested hash agrees`, () => {
    const f = fixture();
    f[which].value = { status: "0x0", transactionHash: "invalid" };
    if (which === "source") f.sourceHash = "invalid" as any;
    else f.destinationHash = "invalid" as any;
    assert.equal(evaluate(f)[which].status, "unknown");
  });
}
test("wrong network stops every evidence claim", () => {
  const f = fixture();
  f.destinationChain = obs("0x4cef52");
  assert.equal(evaluate(f).summary, "wrong_network");
  assert.notEqual(evaluate(f).source.status, "proven");
});
test("null destination preserves unobserved coverage", () => {
  const f = fixture();
  f.destination = obs(null, "null_receipt");
  assert.equal(evaluate(f).destination.status, "null_receipt");
});
for (const which of ["amount", "feeCollected", "mintToken", "mintRecipient"])
  test(`destination ${which} mismatch fails closed`, () => {
    const f = fixture();
    const args: any = {
      amount: 9999000n,
      feeCollected: 1000n,
      mintToken: ARC.token,
      mintRecipient: address("a"),
    };
    args[which] =
      which === "amount" || which === "feeCollected" ? 123n : address("e");
    f.destination.value.logs[0] = event("MintAndWithdraw", args, 4, false);
    assert.notEqual(evaluate(f).destination.status, "observed");
  });
test("canonical event provenance is required", () => {
  const f = fixture();
  f.destination.value.logs[1].address = address("e");
  assert.notEqual(evaluate(f).destination.status, "observed");
});
test("log block and transaction identity must agree with receipt", () => {
  const f = fixture();
  f.source.value.logs[0].blockHash = hash("f");
  assert.notEqual(evaluate(f).source.status, "proven");
});
test("fee above max fails closed", () => {
  const f = fixture();
  f.iris.value.messages[0].message = message({
    nonce: hash("c"),
    finalityThresholdExecuted: 1000,
    feeExecuted: 20000n,
  });
  assert.equal(evaluate(f).attestation.status, "unknown");
});
test("zero attested nonce is rejected", () => {
  const f = fixture();
  f.iris.value.messages[0].message = message({
    finalityThresholdExecuted: 1000,
  });
  assert.equal(evaluate(f).attestation.status, "unknown");
});
test("duplicate immutable Iris candidates are ambiguous", () => {
  const f = fixture();
  f.iris.value.messages.push({ ...f.iris.value.messages[0] });
  assert.equal(evaluate(f).attestation.status, "ambiguous");
});
test("unsupported Iris CCTP version fails closed", () => {
  const f = fixture();
  f.iris.value.messages[0].cctpVersion = 1;
  assert.equal(evaluate(f).attestation.status, "unknown");
});
test("pending Iris is preserved without payout inference", () => {
  const f = fixture();
  f.iris.value.messages[0].status = "pending";
  f.iris.value.messages[0].attestation = "PENDING";
  assert.equal(evaluate(f).attestation.status, "pending");
});
test("deposited burn must match source message", () => {
  const f = fixture();
  f.source.value.logs[1] = event(
    "DepositForBurn",
    {
      burnToken: BASE.token,
      amount: 1n,
      depositor: address("b"),
      mintRecipient: pad(address("a")),
      destinationDomain: 26,
      destinationTokenMessenger: pad(TM),
      destinationCaller: zero,
      maxFee: 10000n,
      minFinalityThreshold: 1000,
      hookData: "0x",
    },
    2,
  );
  assert.equal(evaluate(f).source.status, "unknown");
});
test("report evaluation is deterministic", () => {
  assert.deepEqual(evaluate(fixture()), evaluate(fixture()));
});
test("identical source burns cannot share one nonce and payout claim", () => {
  const f = fixture();
  const sent = { ...f.source.value.logs[0], logIndex: "0x7" };
  const burn = { ...f.source.value.logs[1], logIndex: "0x8" };
  f.source.value.logs.push(sent, burn);
  for (const logIndex of [1, 7]) {
    const r = evaluate({ ...f, logIndex });
    assert.equal(r.source.status, "proven");
    assert.equal(r.attestation.status, "ambiguous");
    assert.notEqual(r.destination.status, "observed");
  }
});
test("malformed canonical receive cannot disappear as a mint-segment boundary", () => {
  const f = fixture();
  f.destination.value.logs[0].logIndex = "0x2";
  f.destination.value.logs.splice(1, 0, {
    ...f.destination.value.logs[1],
    logIndex: "0x3",
    data: "0x",
  });
  const r = evaluate(f);
  assert.equal(r.destination.status, "unknown");
  assert.equal(r.destination.reason, "malformed_canonical_evidence_event");
});
test("malformed canonical burn or message event fails closed", () => {
  const f = fixture();
  f.source.value.logs[1].data = "0x";
  assert.equal(evaluate(f).source.reason, "malformed_canonical_evidence_event");
});
