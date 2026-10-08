# Arc CCTP Casefile implementation plan

Goal: reproducible evidence casefiles for Base → Arc.

Architecture: pure TypeScript evaluator plus bounded collector, loopback static/API server and fixture replay UI.
Spec: DESIGN.md. Native autonomous execution is explicitly authorized in the delegation.

- [x] ABI facts/profiles and adversarial evaluator tests first; prove initial failure, implement source selection/binding/receive correlation.
- [x] Collector transport tests for wrong chain, timeout, 429, null receipts, response size and budget; implement fixed-origin requests and provenance.
- [x] Offline samples, UI timeline/selection/history/downloads, CLI and local security tests; run browser smoke.
- [ ] README, Russian manual, current grant rules/application draft, provenance/licensing. Check secrets/diff, publish new repo and await exact-commit CI.

Review focus: malformed receipts; identical multi-message transactions; offchain attestation mutations; receiver fee/net mismatch; hostile import/URL/Origin data. Tests must keep all uncertain evidence from becoming observed delivery.
