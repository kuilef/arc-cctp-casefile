# Delivery verification

This file records the scope of verification. Exact terminal results and commit/CI URLs are reported in the delivery response and visible in GitHub Actions.

Publication verification: [GitHub Actions run 37847024981](https://github.com/kuilef/arc-cctp-casefile/actions/runs/37847024981) completed successfully for commit `ca55b0fcdefbd1ef8e725bc33cdfc5fa05b8fa14` at 2026-10-08 21:29:19 UTC. Both Windows and Ubuntu Node22 jobs passed lint, typecheck, 72 offline tests, build and dependency audit; Ubuntu also passed all 3 Chromium smoke tests. The documentation-only delivery update is checked by the same workflow; its exact final commit and CI result are provided in the delivery response.

Initial delivery checks on amethyst / Windows / Node20.19.3: **72 offline tests passed, 0 failed; 3 Chromium UI smoke tests passed**. The first independent review found five defects; seven red regression assertions reproduced them and all passed after the fixes. No deferred initial review findings.

Follow-up review reproduced four P2 issues: failed receipt identity checked after failure classification; incomplete RPC envelope validation; lost imported provenance after selection; and exports exceeding the import byte limit. Receipt regressions first failed 8 assertions; RPC regressions failed 13; provenance/byte-limit regressions failed 4 and the forged-live browser case failed. Malformed chain quantities also failed 4 assertions before their validation was added. All were fixed with scoped changes. The targeted independent reviewer passed 106 tests, confirmed exact 2,000,000-byte JSON export/import round trips, and found no new blocker. The final expanded local suite passed **111/111 offline tests and 5/5 Chromium smokes**, including recorded-mainnet replay and browser oversized-append preservation. Typecheck, build, CLI replay/history and audit0 passed; lint passed and its remaining informational formatting hint was removed before publication. Exact final published-head CI is checked again and reported in the delivery response.

- Pure evaluator: synthetic source/attestation/destination vectors; explicit multi-message selection, route/contracts/token/immutable mismatches, version failure, caller restrictions, source placeholder/attested bytes32 nonce, expiry, fee/gross/net, ambiguity, failed/null receipts, provenance and deterministic replay.
- Collector: fixed origins and read methods, wrong-network stop, null-source stop, bounded request/time/size budgets, 429 without retry, strict JSON-RPC2 envelopes and canonical chain quantities, malformed JSON outcomes, credential omission and redirect refusal.
- History: raw earlier observations/timestamps retained; different source rejected. Browser/CLI import recomputes analysis and forces a persistent imported-unverified marker independent of declared mode. A shared UTF-8 byte budget covers append, import and exports and preserves prior data atomically.
- Server: GET-only, fixed routes, Host/Origin checks, no arbitrary proxy/static paths. A Node20 fetch test originally overrode the custom Host header; raw node:http now verifies the actual hostile Host request.
- Browser: Chromium fixture replay, statuses/net-fee, JSON download, repeated observation history, explicit message selection, import and mobile width. Tests start an owned server on port0 and stop only that server.
- Lint, TypeScript check, Vite production build and dependency audit are required in CI. Fixtures are synthetic; the additional recorded public mainnet snapshot is labeled separately. Automated tests make no external RPC/Iris calls.

## Live completed-transfer smoke: observed on 2026-10-08

A later independently researched public candidate enabled one bounded collection, after the initial fixture-only delivery. [Base source](https://basescan.org/tx/0x768ee6d00bf6f8c34d1821c87d2126a3e52d880143a5e794c1d80738328b322d), [Arc destination](https://explorer.arc.io/tx/0xa60955159012accea53ef444c6edf5622acc7c3e61fb6a25c3434ab124c3ef96). [Recorded JSON](../examples/live-2026-10-08.casefile.json), [Markdown](../examples/live-2026-10-08.casefile.md). No transaction was invented or created; no funds were sent.

Six reads through the fixed-origin collector, no retries or scans, observed between **21:46:23.104 and 21:46:23.698 UTC**; recordedAt **21:46:23.699 UTC**. Both chain IDs matched. Base MessageSent log 315 and DepositForBurn log316 proved the source burn. Iris returned one immutable-matching complete message, assigned bytes32 nonce `0xc1c80bf6a99692184e4b18a36528a88f720cba937682ef4985bb346eef613c90`, finality1000, executed fee357, expiration25136461. Arc MintAndWithdraw log8 and MessageReceived log9 matched that nonce, body, domains, contracts, caller restriction, recipient/token and gross/net/fee: **10,998,900 − 357 = 10,998,543** units6. Source block52352569; destination block24964340, before message expiration. The independent reviewer checked these bindings offline with no additional network reads.

Result: **destination_execution_observed**, limited to provider observations and one supplied receipt. Circle signature verification, consensus, current balance/spendability and hook completion remain outside scope. On reimport the saved snapshot is deliberately marked imported-unverified; the raw observations/timestamps remain. One real case does not validate every batch/outage scenario or establish grant eligibility. At the time of that local smoke, public deployment remained pending; the later hosted status is recorded below.

## Publication boundary

Only original source, synthetic fixtures/example casefiles, the explicitly labeled public-RPC/Iris casefile, docs, lockfile, MIT license and CI are published. The live snapshot contains public onchain addresses/activity from the linked transactions and public attestation bytes; no private provider/account data. No node_modules, compiled binaries, private local exports or credentials. The original local validation did not deploy a public service. No grant submission, contact, KYC or payout-wallet action was performed.

## Cloudflare Pages artifact validation: 2026-10-09

The Pages adapter was validated in a Linux cloud workspace with Node 24.19.0. On the final source, `npm test` passed **119/119**; `npm run lint`, `npm run typecheck`, `npm run build:pages`, and `npm audit --audit-level=high` passed (zero reported vulnerabilities). The four additional `npm run test:pages` tests import the actual compiled `_worker.js` and passed **4/4**. They check the Direct Upload layout, static CSP/security headers and API-only routing, fail-closed configuration, all three relevant upstream payloads at exactly 131,072 bytes, and streamed source rejection/cancellation at 131,073 bytes. These are synthetic local test inputs, not live evidence or Cloudflare CPU measurements. CI now builds and tests the Pages artifact explicitly, rather than testing only the Vite UI build.

The built Worker is 10,962 bytes and does collection only; protocol analysis/history/export remain client-side. `esbuild` is a pinned direct development dependency. The validated upload ZIP contains ten files, with `_worker.js`, `_routes.json`, `_headers`, `index.html`, assets and synthetic fixtures at the archive root. It contains no TypeScript/functions source, dependencies, credentials or private history.

Current Chromium execution was **blocked before all five UI tests could run**. The installed browser failed at launch with `socket() failed: Operation not permitted`; an approved elevated retry and a writable browser home did not remove the environment restriction. This is not a new UI pass. Browser smoke on the actual deployed site remains required, including replay/import/export, mobile layout, failed/repeated collection preserving history and honest live-versus-imported provenance.

One bounded, real read-only smoke was made through the compiled Worker in Node at **2026-10-09 09:19:51.813–09:19:56.778 UTC**, using the already documented Base/Arc transaction pair and source log 315. All six provider observations were `ok`; analysis recomputed `source=proven`, `attestation=available`, and `destination=observed`, with gross 10,998,900, net 10,998,543 and fee 357 units6. Source/Iris/destination observations were 8,171/2,717/7,002 serialized bytes including observation metadata, below the public response cap. This exercise used a local KV stub solely for the local adapter invocation; it did not validate a real Cloudflare binding, deployed egress or Cloudflare CPU. No transfer, signature or other onchain write was created.

At that preparation stage, deployment remained conditional on a verified free `RATE_GATE` KV binding, `LIVE_ENABLED` configuration, hosted browser checks and actual Cloudflare runtime/CPU validation. The CPU measurement plan and worst-case payload caveat are in [CLOUDFLARE_RU.md](CLOUDFLARE_RU.md). No new Cloudflare deployment, paid resource, credentials, billing change or GitHub push was performed by this validation step.


## Hosted redirect incompatibility and v2 fix: 2026-10-09

The published URL is [arc-cctp-casefile.pages.dev](https://arc-cctp-casefile.pages.dev/).
Deployment `c9038ac9-5aae-492c-aa2b-6c73cef28125` has `LIVE_ENABLED=true` and
`RATE_GATE` configured. The hosted export recorded at **10:06:23.641 UTC** shows
both chain observations as `network_error`, with no source/Iris/destination/head
collection. The runtime rejected `redirect: "error"` before provider evidence
could be collected. A 200 API envelope here was not a successful live check.

The sole production change is shared transport manual redirect mode and explicit
rejection of every 3xx before reading its body. Redirect observations now retain
`http_<status>`, numeric `httpStatus`, `error: "redirect_refused"`, timestamp and
original provenance, with null value. No Location is requested; no retry is
introduced. Credentials omission, endpoints, methods, request/time/byte budgets,
rate gating and protocol analysis are unchanged. This also works in the local
Node transport, whose redirect failures were previously generic network errors.

Red-first proof: the original source failed three transport assertions; the old
compiled artifact failed three Pages tests. The old bundle also failed both
socket-free **workerd 2026-10-06** (npm **1.20261006.1**) test cases with `network_error`. After the fix,
**121/121 source tests, 5/5 compiled Pages tests and 2/2 real workerd tests** passed.
Lint, typecheck, `build:pages` and dependency audit passed with zero vulnerabilities.
The new source regressions cover RPC and Iris with statuses 300–308 and 399,
null values, preserved evidence, no body read, and no extra request/retry. Compiled
regression checks both chain failures stop all later collection. Existing compiled
128 KiB and 128 KiB+1 budget tests remain green.

The optional `tests/workerd/config.capnp` harness invokes the actual built Worker
using native workerd Request/fetch/Response APIs and synthetic in-process upstream
services, without sockets or external networking. It checks six successful reads
and redirect refusal. KV is a stub. **These tests do not prove hosted provider
connectivity, production binding behavior, Cloudflare CPU usage or the worst-case
runtime payload.** That fix was subsequently redeployed as v2; the next section records its hosted result.
Actual CPU measurements remain pending.
Linux CI now installs that exact workerd version in a temporary prefix and runs
the same compiled-artifact harness; project dependencies and lockfile are unchanged.
Both push and PR CI completed successfully for commit `48f36e305d582f99394cd3f540c572b22095b109`, including this workerd step, Windows/Linux checks and Chromium smoke: [PR run 37916394670](https://github.com/kuilef/arc-cctp-casefile/actions/runs/37916394670). See
[CLOUDFLARE_RU.md](CLOUDFLARE_RU.md) for the repeatable command, bounded hosted
smoke and fallback plan.


## Hosted v2 upstream limit and v3 provider selection: 2026-10-09

Production v2 deployment `a2c335a3-f2bd-4249-8b67-3cd9aeae5539` was independently
checked from a cloud browser on the actual Pages origin, using only the same known
public transaction pair. At **10:23:58.211 UTC**, Base chain ID observation was
`http_429` / HTTP429 at `https://mainnet.base.org`. At **10:23:58.221 UTC**, Arc chain
ID observation was `ok`, value `0x13b2`. All later observations were
`not_requested`. The exported JSON proves the manual redirect fix reached the
Worker and that the remaining failure was a provider rate limit; it does not
establish successful CCTP evidence or CPU compliance. No simultaneous live probes,
retries, broad scans or provider rotation were performed.

[Base's October 8 change](https://status.base.org/incidents/jrs0dpj60tqz) reduced
public read limits. The v3 Worker adds only a deployment-selected fixed alternative,
[PublicNode's advertised free Base RPC](https://base.publicnode.com/), with
`BASE_RPC_PROVIDER=publicnode`; default `base-public` preserves existing behavior.
Unknown names fail closed. Actual provider provenance, chain-ID checks, six reads,
8-second/read and 40-second total budgets, 128-KiB public response cap, read-only
methods, no credentials and redirect refusal remain enforced. There is no automatic
retry or fallback on failure. Hosted v3 validation and CPU metrics are still pending.

CI also uploads the tested Pages directory after Linux checks for direct browser
download, with seven-day retention. This upload does not deploy to Cloudflare.

A dashboard runtime log matching the partial v2 case at **10:23:57 UTC** reported
CPU **3 ms**, wall **298 ms**, outcome `ok`, exceptions `[]`. This is only the
short-circuited two-chain-read invocation, not a full case or 128-KiB validation.
An independent API guard request at **10:31:20 UTC** (CF-Ray
`a47cb70f38cb69cc-DFW`) returned HTTP403 `same_origin_required`, with
`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` and CSP
`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`. This guard check
made no upstream reads.

V3 preserves received Retry-After strings on HTTP429/503, without retrying.
Valid delta-seconds or strict IMF-fixdate guidance up to 24 hours extends the
existing KV marker with a 90-second minimum. Missing guidance keeps 90 seconds;
invalid or longer guidance writes a persistent fail-closed marker requiring
operator review. Read-before-extension preserves any visible longer/blocked
marker, but eventual consistency still permits races; this is not an atomic
quota. KV failures/timeouts close the affected request with 503. If extension persistence
fails, the previous 90-second marker can expire earlier than provider guidance;
there is no durable-backoff guarantee under storage failure. Disable live and
investigate rather than repeatedly retrying after such an error.

V3 intentionally requires RATE_GATE for all live Worker requests, even when
CASE_IP/CASE_LOCATION are configured. Those limiters supplement persistent
upstream backoff; without KV the adapter returns503 before collection. The
optional Workers sample needs an authorized KV binding before live can be enabled.

Review caught the KV same-key limit of one write/second: a fast upstream429 could
otherwise make the admission and backoff-extension writes conflict. V3 waits up
to 1.1 seconds after admission put completion before rereading/extending that key.
A faithful rate-limited KV stub covers this path. This bounded extra wait is not
an upstream retry or an atomic cross-isolate write guarantee.


V3 local regressions pass **170 source tests, 16 compiled Pages tests and 7 real
workerd scenarios**, plus lint, typecheck and build. These cover both fixed Base
providers, invalid provider names failing before collection, chain mismatch,
128-KiB cap, raw Retry-After export/import preservation, seconds/date parsing,
invalid/over-limit operator blocks, mandatory KV, storage errors, visible longer
markers and same-key write spacing. New behavior was first observed failing
against v2; the spacing regression reproduced HTTP503 before the fix.

Two additional browser regressions verify the actual Retry-After wait and
operator-review message while preserving history. Local Playwright cannot run in
this cloud workspace, so these are pending the GitHub Linux Chromium CI run;
no local browser pass is claimed. UI wording now says fixed allowlisted RPCs,
not that every provider is official. Hosted v3 and full-case CPU remain pending.
