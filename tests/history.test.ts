import { test } from "node:test";
import assert from "node:assert/strict";
import { appendCasefile, markdown } from "../src/casefile";
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
test("collector stops after wrong chain IDs with two requests", async () => {
  const t = createTransport(async () => Response.json({ result: "0x1" }));
  const i = await collect(hash("1"), undefined, undefined, t);
  assert.equal(t.requestCount(), 2);
  assert.equal(i.source.status, "not_requested");
});
test("collector preserves a null source receipt without further reads", async () => {
  const t = createTransport(async (u: any, o: any) => {
    const m = JSON.parse(o.body).method;
    return Response.json({
      result:
        m === "eth_chainId" ? (u.includes("base") ? "0x2105" : "0x13b2") : null,
    });
  });
  const i = await collect(hash("1"), undefined, undefined, t);
  assert.equal(t.requestCount(), 3);
  assert.equal(i.source.status, "null_receipt");
});
