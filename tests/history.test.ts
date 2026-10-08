import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendCasefile,
  normalizeCasefile,
  markdown,
  importCasefile,
  serializeCasefile,
  MAX_CASEFILE_BYTES,
} from "../src/casefile";
import { fixture, obs, hash } from "./helpers";
import { collect } from "../src/collector";
import { createTransport } from "../src/transport";
test("history rejects per-observation source identity forgery", () => {
  const previous = appendCasefile(fixture());
  previous.observations[0].input.sourceHash = hash("f");
  assert.throws(() => appendCasefile(fixture(), previous));
});
test("history recomputes prior analyses without losing raw data or timestamps", () => {
  const previous = appendCasefile(fixture(), undefined, "2026-10-08T21:00:00Z");
  previous.observations[0].analysis.destination.status = "forged_success";
  const after = appendCasefile(fixture(), previous);
  assert.equal(after.observations[0].analysis.destination.status, "observed");
  assert.equal(after.observations[0].recordedAt, "2026-10-08T21:00:00Z");
  assert.deepEqual(after.observations[0].input, previous.observations[0].input);
});
test("history cap rejects append before producing an unimportable file", () => {
  const previous = appendCasefile(fixture());
  previous.observations = Array.from(
    { length: 100 },
    () => previous.observations[0],
  );
  assert.throws(() => appendCasefile(fixture(), previous), /history_limit/);
  assert.equal(previous.observations.length, 100);
});
test("history retains earlier raw observations and timestamps", () => {
  const f = fixture();
  const before = appendCasefile(f, undefined, "2026-10-08T21:00:00Z");
  const g = fixture();
  g.iris = obs(null, "timeout");
  const after = appendCasefile(g, before, "2026-10-08T22:00:00Z");
  assert.deepEqual(after.observations[0], before.observations[0]);
  assert.equal(
    after.observations[1].analysis.attestation.status,
    "unavailable",
  );
  assert.match(markdown(after), /Observation 2/);
});
test("different source cannot overwrite previous history", () => {
  const before = appendCasefile(fixture());
  assert.throws(() =>
    appendCasefile({ ...fixture(), sourceHash: hash("f") }, before),
  );
});
test("import overrides forged live provenance and preserves it on reselection", () => {
  const input = fixture();
  input.mode = "live";
  const previous = appendCasefile(input);
  (previous.observations[0] as any).origin = "live-collected";
  const imported = normalizeCasefile(previous, true);
  assert.equal((imported.observations[0] as any).origin, "imported-unverified");
  const after = appendCasefile({ ...input, logIndex: 1 }, imported);
  assert.ok(
    after.observations.every((o: any) => o.origin === "imported-unverified"),
  );
  assert.match(markdown(after), /imported-unverified/);
});
test("declared live mode alone cannot claim local collection provenance", () => {
  const input = fixture();
  input.mode = "live";
  assert.equal(
    (appendCasefile(input).observations[0] as any).origin,
    "imported-unverified",
  );
});
test("combined export byte budget rejects the next large snapshot atomically", () => {
  const input = fixture();
  input.source.value.providerPadding = "x".repeat(600_000);
  assert.ok(Buffer.byteLength(JSON.stringify(input.source.value)) < 1_048_576);
  let previous = appendCasefile(input);
  previous = appendCasefile(input, previous);
  previous = appendCasefile(input, previous);
  const original = JSON.stringify(previous);
  assert.ok(Buffer.byteLength(JSON.stringify(previous, null, 2)) < 2_000_000);
  assert.throws(() => appendCasefile(input, previous), /casefile_byte_limit/);
  assert.equal(JSON.stringify(previous), original);
  assert.deepEqual(
    normalizeCasefile(previous).observations,
    previous.observations,
  );
  const exported = serializeCasefile(previous);
  assert.ok(Buffer.byteLength(exported) <= MAX_CASEFILE_BYTES);
  const imported = importCasefile(exported);
  assert.equal(imported.observations.length, 3);
  assert.equal(
    imported.observations[0].input.source.value.providerPadding,
    input.source.value.providerPadding,
  );
});
test("normalization rejects a casefile that already exceeds the byte budget", () => {
  const file = appendCasefile(fixture());
  file.observations[0].input.source.value.providerPadding = "x".repeat(
    2_000_000,
  );
  assert.throws(() => normalizeCasefile(file), /casefile_byte_limit/);
});
test("oversized UTF-8 import is rejected before parsing without changing prior history", () => {
  const previous = appendCasefile(fixture());
  const before = serializeCasefile(previous);
  assert.throws(
    () => importCasefile("\u0436".repeat(1_000_001)),
    /casefile_byte_limit/,
  );
  assert.equal(serializeCasefile(previous), before);
});
test("collector stops after wrong chain IDs with two requests", async () => {
  const t = createTransport(async () =>
    Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" }),
  );
  const i = await collect(hash("1"), undefined, undefined, t);
  assert.equal(t.requestCount(), 2);
  assert.equal(i.source.status, "not_requested");
});
test("collector preserves a null source receipt without further reads", async () => {
  const t = createTransport(async (u: any, o: any) => {
    const m = JSON.parse(o.body).method;
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result:
        m === "eth_chainId" ? (u.includes("base") ? "0x2105" : "0x13b2") : null,
    });
  });
  const i = await collect(hash("1"), undefined, undefined, t);
  assert.equal(t.requestCount(), 3);
  assert.equal(i.source.status, "null_receipt");
});
test("collector stops on malformed chain envelopes and retains exact status", async () => {
  const t = createTransport(async () => Response.json({ result: "0x2105" }));
  const input = await collect(hash("1"), undefined, undefined, t);
  assert.equal(t.requestCount(), 2);
  assert.equal(input.sourceChain.status, "invalid_rpc_response");
  assert.equal(input.destinationChain.status, "invalid_rpc_response");
  assert.equal(input.source.status, "not_requested");
  assert.equal(input.iris.status, "not_requested");
});
