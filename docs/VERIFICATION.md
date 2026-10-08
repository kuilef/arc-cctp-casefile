# Delivery verification

This file records the scope of verification. Exact terminal results and commit/CI URLs are reported in the delivery response and visible in GitHub Actions.

Publication verification: [GitHub Actions run 37847024981](https://github.com/kuilef/arc-cctp-casefile/actions/runs/37847024981) completed successfully for commit `ca55b0fcdefbd1ef8e725bc33cdfc5fa05b8fa14` at 2026-10-08 21:29:19 UTC. Both Windows and Ubuntu Node22 jobs passed lint, typecheck, 72 offline tests, build and dependency audit; Ubuntu also passed all 3 Chromium smoke tests. The documentation-only delivery update is checked by the same workflow; its exact final commit and CI result are provided in the delivery response.

Local final checks on amethyst / Windows / Node20.19.3: **72 offline tests passed, 0 failed; 3 Chromium UI smoke tests passed**. Lint with warnings treated as errors, TypeScript check, production build, CLI JSON/Markdown/history replay and npm audit passed (0 vulnerabilities). The independent review found five defects; seven red regression assertions reproduced them and all passed after the fixes. No deferred review findings. Final publication CI is required for the exact published commit, not inferred from these local results.

- Pure evaluator: synthetic source/attestation/destination vectors; explicit multi-message selection, route/contracts/token/immutable mismatches, version failure, caller restrictions, source placeholder/attested bytes32 nonce, expiry, fee/gross/net, ambiguity, failed/null receipts, provenance and deterministic replay.
- Collector: fixed origins and read methods, wrong-network stop, null-source stop, bounded request/time/size budgets, 429 without retry, RPC/malformed JSON outcomes, credential omission and redirect refusal.
- History: raw earlier observations/timestamps retained; different source rejected. Browser import recomputes analysis and keeps supplied provenance explicitly untrusted.
- Server: GET-only, fixed routes, Host/Origin checks, no arbitrary proxy/static paths. A Node20 fetch test originally overrode the custom Host header; raw node:http now verifies the actual hostile Host request.
- Browser: Chromium fixture replay, statuses/net-fee, JSON download, repeated observation history, explicit message selection, import and mobile width. Tests start an owned server on port0 and stop only that server.
- Lint, TypeScript check, Vite production build and dependency audit are required in CI. All fixtures are synthetic; tests make no external RPC/Iris calls.

## Live completed-transfer smoke: pending

No independently confirmed existing completed Base → Arc mainnet transfer was obtained. Public web lookup did not provide a verifiable pair; prior arc_monitor research explicitly reported fresh live CCTP evidence unknown. No transaction hash was invented, no funds were sent and no new transfer was made. **Completed-transfer live smoke: not run.** No mainnet receipt/attestation or destination delivery is claimed by this delivery.

Pending evidence: publicly documented source hash on Base, exact corresponding destination hash on Arc, successful receipts from the official RPCs, a bound Iris message/attestation, canonical provenance and receiver net/fee matches, with collection timestamps. Use at most six reads through the collector once such an independently established completed case exists. Save the casefile separately after reviewing public-data sharing. Keep fixture-only validation labeled until then.

## Publication boundary

Only original source, synthetic fixtures/example casefiles, docs, lockfile, MIT license and CI are published. No node_modules, compiled binaries, private local exports, raw private provider responses or credentials. No public service deployment, grant submission, contact, KYC or payout-wallet action was performed.
