# Arc CCTP Casefile

A local, read-only evidence report for an **existing Base mainnet → Arc mainnet USDC transfer**. Give it a source transaction hash and, optionally, a known destination transaction hash. Export a support case with raw public observations, timestamps, provider origins and explicit evidence limits.

**Current validation: offline replay plus one existing public Base → Arc completed-transfer smoke**, collected on 2026-10-08 at 21:46:23 UTC using six bounded reads. Source, Iris and destination event evidence were bound; [recorded JSON](examples/live-2026-10-08.casefile.json) and [Markdown](examples/live-2026-10-08.casefile.md) preserve the observations. This is provider-observed execution within one supplied receipt, with the limitations below. No deployment was made.

## Run

Node 20.19+ (22 recommended), npm and Git. No wallet, API key or account required.

```sh
git clone https://github.com/kuilef/arc-cctp-casefile.git
cd arc-cctp-casefile
npm ci --ignore-scripts
npm run build
npm start
```

Open the printed `CASEFILE_URL=http://127.0.0.1:<port>`. The OS chooses a free loopback port. In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. Stop only this server with Ctrl+C.

Click **Replay fixture** for an offline demo after installation. Four invented vectors show matched net/fee execution, available attestation without destination evidence, an Iris 429 and multiple source messages. Fixtures use fake transaction hashes and fake signatures; they are never live evidence.

Example exports: [JSON](examples/synthetic.casefile.json), [Markdown](examples/synthetic.casefile.md), [two-observation history](examples/synthetic-history.casefile.json). These are synthetic, including all hashes and signature bytes.

## What the report proves

| Stage | Required evidence | Boundary |
|---|---|---|
| Source burn | Successful Base receipt, canonical MessageSent and uniquely matching DepositForBurn | Burn alone does not prove delivery |
| Circle observation | Iris GET result; immutable message fields match the selected source log | `complete` and attestation bytes do not prove minting; signatures are not verified locally |
| Destination execution | Successful supplied Arc receipt, canonical bytes32-nonce MessageReceived and uniquely associated MintAndWithdraw; matching body, caller, token, recipient, net and fee | Contract event evidence, not a current balance, spendability or hook-completion claim |

Several source messages require an explicit `logIndex`; no first-message default. Equal immutable Iris candidates are ambiguous. Format version 1 / burn-body version 1 means CCTP **protocol v2**; unsupported versions fail closed. Nonce, executed finality, executed fee and expiration can be assigned offchain, so whole-message byte equality is deliberately not used for source binding. Destination message body must match the selected attested body.

Coverage is **one user-provided destination receipt**, with zero scanned blocks. No destination hash means `unobserved`, never `unminted`. Nonce usage alone is insufficient and is not queried. Destination matching uses event order within a single receive segment; unusual/batched/indistinguishable mint segments fail closed. Provider errors, missing receipts and ambiguity remain visible in JSON. Every recheck appends a snapshot; download it before closing, then import it to continue.

Each snapshot records a local origin: `fixture-replay`, `live-collected`, or `imported-unverified`. Import always forces the last marker, including subsequent message selection; an input file's `mode` cannot claim local collection. JSON exports are unsigned observations. A shared **2,000,000 UTF-8 byte / 100 observation** limit applies to append, export and import. Exceeding either limit rejects the new snapshot and preserves earlier data; export the history and start a new casefile. Large receipts can reach the byte limit well before 100 snapshots.

## Cloudflare Pages preparation

The separate Pages adapter is built with `npm run build:pages`; validate its compiled bundle with `npm run test:pages`. The output is a Direct Upload-ready `dist/` with `_worker.js`, API-only routing, static assets and synthetic replay fixtures. Deployment instructions, the required free KV binding, fail-closed defaults, and the mandatory Cloudflare CPU/live smoke are in [docs/CLOUDFLARE_RU.md](docs/CLOUDFLARE_RU.md). Building locally does not establish a successful deployment or compliance with the Free CPU limit.

## CLI

```sh
npm run cli -- --fixture fixtures/completed.json --out sample.json
npm run cli -- --fixture fixtures/completed.json --markdown --out sample.md
npm run cli -- --fixture fixtures/unobserved.json --previous sample.json --out updated.json
```

Live: `npm run cli -- --source PUBLIC_SOURCE_HASH --destination PUBLIC_DESTINATION_HASH --logIndex 1`. Replace the placeholders with independently documented existing transaction hashes. Destination and log index are optional except explicit selection is required for multiple source messages. Read the Russian walkthrough in [MANUAL_RU.md](MANUAL_RU.md).

## Verify

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run smoke
```

CI runs checks on Ubuntu and Windows / Node 22; Chromium UI smoke runs on Ubuntu. Tests replay synthetic vectors and the recorded public snapshot; they make no upstream RPC/Iris calls. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for verification details and live-case scope.

## Network and privacy

Fixed profiles only: Base `8453 / domain 6`, Arc `5042 / domain 26`. Both chain IDs must match before collection. Fixed official origins: `https://mainnet.base.org`, `https://rpc.mainnet.arc.io`, `https://iris-api.circle.com` (documented `GET /v2/messages/6?transactionHash=…`). RPC HTTP POST carries only allowlisted read methods. No Iris POST, arbitrary URLs, signing, minting, recovery, wallet connection, authentication, credentials, paid API or broad chain scan.

Per case: at most 6 upstream requests, 8 seconds per request, 40 seconds total, 1 MiB per response, no retry on 429. The server binds only `127.0.0.1`, validates Host/Origin, allows one active collection, serves allowlisted built assets/fixtures and logs only its launch URL. Do not expose this server on a public interface. Raw exports contain public recipient/activity data; storage and sharing are your decision. Imports are untrusted provider observations, not authenticated evidence.

## Sources, licensing and related work

Original implementation and synthetic vectors: **MIT**. No code or private data was copied from `arc_monitor` or other projects. Dependencies retain their own licenses; [docs/PROVENANCE.md](docs/PROVENANCE.md) records protocol sources and the outdated event-table discrepancy.

[Circle sample app](https://github.com/circlefin/cctp-sample-app) demonstrates transfers; [Arc recovery docs](https://docs.arc.io/app-kit/references/bridge-error-recovery) cover troubleshooting/recovery; [0xferrous/cctp](https://github.com/0xferrous/cctp) already offers status, attestation and recovery CLI commands; [Bridge ID SDK](https://github.com/heyeren2/bridge-id-sdk) instruments bridge lifecycle callbacks. This project focuses on an independent casefile for an arbitrary already-existing supported transfer, raw evidence/history and explicit coverage. It is not a wrapper around those tools and does not claim absolute novelty.

[GRANTS_RU.md](GRANTS_RU.md) contains a cautious Arc Microgrants application draft and user-only submission steps. Read-only eligibility and multiple awards to one solo builder remain unconfirmed; no application or contact was made.
