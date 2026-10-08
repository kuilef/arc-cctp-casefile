# Protocol facts and rights

Checked 2026-10-08. Protocol field layouts and addresses are independently encoded facts, not copied Solidity implementation. Source code, styling, prose and synthetic fixtures were written for this repository. No code, private database, PII or Bitquery response was copied from arc_monitor. No upstream source was vendored. MIT covers our original files; installed dependencies retain their own license terms in node_modules (not published).

Canonical references:

- [Circle technical guide](https://developers.circle.com/cctp/references/technical-guide): version-1 header/burn body for protocol v2, bytes32 offchain nonce, field offsets, Iris mainnet origin, fee/finality/expiration semantics.
- [Circle contract addresses](https://developers.circle.com/cctp/references/contract-addresses): Base domain6 and Arc domain26; both TokenMessengerV2 `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`, MessageTransmitterV2 `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`.
- [Circle contract interfaces](https://developers.circle.com/cctp/references/contract-interfaces): method roles. **Its event table still describes legacy uint64 nonce/indexing and omits receiver fee. Do not use that event table for v2 ABI decoding.**
- [Circle official MessageTransmitterV2 Solidity](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/MessageTransmitterV2.sol): MessageReceived has indexed caller, indexed bytes32 nonce, indexed executed finality; sourceDomain/sender/body are nonindexed. MessageReceived emits after the handler succeeds.
- [Circle official TokenMessengerV2](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/TokenMessengerV2.sol) and [BaseTokenMessenger](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/BaseTokenMessenger.sol): DepositForBurn v2 fields/indexing; MintAndWithdraw net amount and feeCollected. This official source is Apache-2.0, consulted for ABI facts; implementation code was not copied.
- [GET messages API](https://developers.circle.com/api-reference/cctp/all/get-messages-v2): `GET /v2/messages/{sourceDomainId}?transactionHash=…`, messages ordered by log index; root sourceTxHash is required by the current schema.
- [Base network details](https://docs.base.org/get-started/connect-to-base): mainnet chain8453 and official read RPC mainnet.base.org.
- [Arc connection details](https://docs.arc.io/arc/references/connect-to-arc): mainnet chain5042 and rpc.mainnet.arc.io; testnet is separate5042002 and unsupported here.
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses): Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Arc `0x3600000000000000000000000000000000000000`.
- [Arc system events](https://docs.arc.io/arc/references/usdc-system-events): distinct native18/ERC20 six-decimal emitters; this report does not aggregate mirrored Transfer logs.

Related projects were inspected as scope references, not imported: Circle cctp-sample-app, Arc App Kit bridge recovery docs, 0xferrous/cctp (status/attestation and execution/recovery CLI), heyeren2/Bridge-id-sdk (callback lifecycle instrumentation and backend analytics). Independent casefile packaging is the product distinction; global novelty is unproven.
