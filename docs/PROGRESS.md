# Implementation ledger

Plan: PLAN.md; spec: DESIGN.md. Autonomous design/native implementation/public GitHub publication were explicitly authorized by the delegation; no overnight questions are needed.

1. Evaluator RED: 46 tests, 15 failed against a stub. GREEN: 46 passed. Immutable/offchain field binding and canonical v2 ABI verified.
2. Transport RED: 9 failed against a stub. GREEN: collector/history 13 passed. Initial Node type peer mismatch corrected; Vite upgraded to audited patched 7.3.7, audit 0 vulnerabilities.
3. Server RED: 6 failed against a stub. First full run: 64/65. Investigation: Node20 fetch overwrote hostile Host header; raw http request tests the actual header. Browser smoke and final suite results follow in CI/delivery.

Ruling: use only one supplied destination receipt rather than bounded-range discovery — fits the explicit bounded-evidence scope, avoids broad scans; cost: user must provide destination hash for receipt proof.

Ruling: require unique matching source/Iris/destination segments, return ambiguous for indistinguishable batches — prevents false success; cost: some legitimate complex transfers stay unknown.

Initial ruling: completed-transfer live smoke stayed pending because no independently confirmed public completed Base→Arc pair was available. This was superseded by the later bounded live collection below. Grant deployment eligibility remains unconfirmed.

Environment note: amethyst is this Windows machine. A remote /root recursive inspection was rejected by automatic approval review because it might traverse protected agent state. It was abandoned; hostname/Tailscale self inspection identified local amethyst, and all project work stayed in the isolated authorized local workspace. No blocked publication or implementation action remained from that rejection.

Independent read-only review: 3 Important + 2 Minor findings, reproduced without live queries. Re-graded malformed-target crash and unimportable history-cap export as Important by user impact; all five were fixed in one pass. RED: six evaluator/history regression failures and one isolated-server crash assertion. GREEN: 72/72 offline tests, 3/3 browser smokes, production build and dependency audit0; final type/lint fix was followed by fresh checks before publication.

Fixed: identical source burns cannot share a single Iris nonce/destination payout claim; malformed canonical evidence topics cannot disappear from receive boundaries; every previous-history observation is identity/provenance checked and analysis recomputed; malformed URL targets return400; cap rejects append before producing101 observations. Earlier raw observations and timestamps remain unchanged. Deferred minors: none.

Initial publication: new public `kuilef/arc-cctp-casefile`, MIT, created only after absence checks. Initial source commit `ca55b0fcdefbd1ef8e725bc33cdfc5fa05b8fa14` passed both Windows and Ubuntu jobs in Actions run37847024981. Documentation commit `bc5e5757f9a663d9b7f3cc2b1b11b1015c59a23b` passed run37847402845. At that initial delivery, completed-transfer live smoke and public deployment were pending.

Follow-up: parent supplied four P2 counterexamples, all reproduced before correction. Failed-receipt identity/object/status validation precedes classification; RPC envelopes and chain quantities fail closed; imported snapshots and reselections retain local imported-unverified origin; shared 2,000,000-byte UTF-8 budget rejects append atomically before creating an unimportable export. Prior raw data/timestamps are retained. Targeted independent review passed 106 offline tests, exact-boundary byte probes and offline inspection of the live snapshot; no new blocker.

Parent supplied a public transfer candidate and explicitly authorized one documented Iris GET after confirming the browser failure was ERR_BLOCKED_BY_CLIENT rather than an authorization denial. Fixed-origin collector performed exactly six reads at 21:46:23 UTC; no proxy/security changes, retry, scan, transaction or spend. Source315/316, one bound Iris message, destination8/9 and gross10998900/net10998543/fee357 matched. Public evidence exports are in examples/live-2026-10-08.casefile.*. The original observation is preserved, and imported copies are marked unverified. amethyst local execution was confirmed available by successful commands and hostname after the parent's connection concern; no persistent execution blocker.

Expanded follow-up local checks: 111/111 offline tests, 5/5 Chromium browser smokes, typecheck/build/CLI replay-history/audit0 passed. A lint informational template hint was removed; publication requires a fresh strict lint and terminal CI on the exact follow-up commit. The public live replay is offline in CI, never recollected automatically.
