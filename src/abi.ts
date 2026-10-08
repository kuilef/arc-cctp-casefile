import { parseAbi } from "viem";
// Independently written interface declarations; signatures verified in Circle's v2 Solidity source.
export const ABI = parseAbi([
  "event MessageSent(bytes message)",
  "event DepositForBurn(address indexed burnToken,uint256 amount,address indexed depositor,bytes32 mintRecipient,uint32 destinationDomain,bytes32 destinationTokenMessenger,bytes32 destinationCaller,uint256 maxFee,uint32 indexed minFinalityThreshold,bytes hookData)",
  "event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)",
  "event MintAndWithdraw(address indexed mintRecipient,uint256 amount,address indexed mintToken,uint256 feeCollected)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
