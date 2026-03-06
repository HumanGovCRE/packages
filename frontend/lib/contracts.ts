// Contract ABIs and addresses

export const REGISTRY_ABI = [
  "function isHuman(address wallet) external view returns (bool)",
  "function getVerification(address wallet) external view returns (tuple(bytes32 nullifier, address wallet, uint256 expiry, bool active))",
  "function registerVerification(bytes32 nullifier, address wallet) external",
  "function revokeVerification(bytes32 nullifier) external",
  "function propagateToChain(bytes32 nullifier, uint64 destinationChainSelector) external payable",
  "function setAuthorizedCREWorkflow(address workflow) external",
  "function setTargetChainReceiver(uint64 chainSelector, address receiver) external",
  "function authorizedCREWorkflow() external view returns (address)",
  "function targetChainReceivers(uint64) external view returns (address)",
  "event HumanVerified(bytes32 indexed nullifier, address indexed wallet, uint256 expiry)",
  "event CrossChainPropagated(bytes32 indexed nullifier, uint64 destinationChainSelector, bytes32 messageId)",
] as const;

export const DAO_ABI = [
  "function createProposal(string calldata title, string calldata description, uint256 votingDuration) external",
  "function vote(uint256 proposalId, bool support) external",
  "function finalizeProposal(uint256 proposalId) external",
  "function getProposal(uint256 id) external view returns (tuple(uint256 id, string title, string description, address proposer, uint256 startTime, uint256 endTime, uint256 yesVotes, uint256 noVotes, bool executed, uint8 status))",
  "function proposalCount() external view returns (uint256)",
  "function isHuman(address wallet) external view returns (bool)",
  "function getHumanStatus(address wallet) external view returns (bool verified, uint256 expiry)",
  "function hasVoted(uint256, bytes32) external view returns (bool)",
  "function walletToNullifier(address) external view returns (bytes32)",
  "event ProposalCreated(uint256 indexed proposalId, string title, address proposer)",
  "event Voted(uint256 indexed proposalId, bytes32 indexed nullifier, bool support)",
  "event ProposalFinalized(uint256 indexed proposalId, uint8 status, uint256 yes, uint256 no)",
  "event HumanStatusReceived(bytes32 indexed nullifier, address indexed wallet, uint256 expiry)",
] as const;

export const REGISTRY_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

export const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS || "";

export const CHAIN_CONFIG = {
  source: { id: 11155111, name: "Sepolia" },
  target: { id: 84532, name: "Base Sepolia" },
};
