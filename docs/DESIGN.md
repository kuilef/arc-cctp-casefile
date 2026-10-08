# Arc CCTP Casefile design

Autonomously approved scope: one existing Base mainnet → Arc mainnet USDC transfer, read-only evidence collection for support and developers.

Use a TypeScript pure evaluator, viem ABI utilities, a local-only Node server with fixed official upstreams, and a small browser UI. Offline synthetic fixtures use the same evaluator. Each observation records exact fetch outcomes and raw public receipts/API responses. Rechecks append snapshots. JSON and Markdown exports preserve provenance and coverage.

The evaluator requires explicit source log selection when multiple MessageSent logs exist. Source MessageSent bytes and a uniquely matching DepositForBurn event establish the burn. Bind Iris bytes using immutable fields; allow only offchain nonce, executed finality, executed fee and expiration mutations. Only format version 1 / burn version 1 (protocol CCTP v2) is supported. Reject route, token, caller, fee or immutable mismatch.

Destination evidence is limited to one user-provided transaction receipt. Require successful Arc receipt, canonical MessageReceived bytes32 nonce/body/caller fields and a uniquely associated MintAndWithdraw net/fee/token event in the same receive segment. Never infer payout from attestation or used nonce alone. Missing data stays unknown/unobserved. No broad scans, signing or recovery.

Arc mainnet 5042/domain 26 and Base 8453/domain 6 are separate immutable profiles. Both RPC chain IDs must match before live collection. No configurable upstream URLs. Local server validates Host/Origin, permits GET routes only, limits bodies/responses/timeouts/concurrency; no logging of input hashes.

Live completion evidence is pending independently verified public source/destination receipts. Synthetic fixtures are prominently labeled; no fabricated hash is used for live smoke.
