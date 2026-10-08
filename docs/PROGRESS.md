# Implementation ledger

Plan: PLAN.md; spec: DESIGN.md. Autonomous design/native implementation/public GitHub publication were explicitly authorized by the delegation; no overnight questions are needed.

1. Evaluator RED: 46 tests, 15 failed against a stub. GREEN: 46 passed. Immutable/offchain field binding and canonical v2 ABI verified.
2. Transport RED: 9 failed against a stub. GREEN: collector/history 13 passed. Initial Node type peer mismatch corrected; Vite upgraded to audited patched 7.3.7, audit 0 vulnerabilities.
3. Server RED: 6 failed against a stub. First full run: 64/65. Investigation: Node20 fetch overwrote hostile Host header; raw http request tests the actual header. Browser smoke and final suite results follow in CI/delivery.

Ruling: use only one supplied destination receipt rather than bounded-range discovery — fits the explicit bounded-evidence scope, avoids broad scans; cost: user must provide destination hash for receipt proof.

Ruling: require unique matching source/Iris/destination segments, return ambiguous for indistinguishable batches — prevents false success; cost: some legitimate complex transfers stay unknown.

Ruling: completed-transfer live smoke stays pending — no independently confirmed public completed Base→Arc pair available; cost: mainnet integration and grant deployment eligibility remain unproven.

Environment note: amethyst is this Windows machine. A remote /root recursive inspection was rejected by automatic approval review because it might traverse protected agent state. It was abandoned; hostname/Tailscale self inspection identified local amethyst, and all project work stayed in the isolated authorized local workspace. No blocked publication or implementation action remained from that rejection.

Independent read-only review: 3 Important + 2 Minor findings, reproduced without live queries. Re-graded malformed-target crash and unimportable history-cap export as Important by user impact; all five were fixed in one pass. RED: six evaluator/history regression failures and one isolated-server crash assertion. GREEN: 72/72 offline tests, 3/3 browser smokes, production build and dependency audit0; final type/lint fix was followed by fresh checks before publication.

Fixed: identical source burns cannot share a single Iris nonce/destination payout claim; malformed canonical evidence topics cannot disappear from receive boundaries; every previous-history observation is identity/provenance checked and analysis recomputed; malformed URL targets return400; cap rejects append before producing101 observations. Earlier raw observations and timestamps remain unchanged. Deferred minors: none.
