// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAny2EVMMessageReceiver} from "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title HumanGovDAO
 * @notice Lives on Base Sepolia. Receives verified-human status via Chainlink CCIP
 *         and enforces one-human-one-vote governance.
 * @dev Human status is populated exclusively through the CCIP receive path from
 *      the HumanRegistry on Ethereum Sepolia. Only wallets with a live, non-expired
 *      human record may create proposals or vote.
 */
contract HumanGovDAO is Ownable, ReentrancyGuard, IAny2EVMMessageReceiver {
    // ─────────────────────────────────────────────────────────── immutables ──

    /// @notice Chainlink CCIP router on Base Sepolia.
    address public immutable ccipRouter;

    // ───────────────────────────────────────────────────────────────── state ──

    /// @notice Whether a nullifier hash is currently recognized as verified.
    mapping(bytes32 => bool) public verifiedHumans;

    /// @notice Expiry timestamp for each nullifier.
    mapping(bytes32 => uint256) public humanExpiry;

    /// @notice Maps nullifier hash → wallet address.
    mapping(bytes32 => address) public nullifierToWallet;

    /// @notice Maps wallet address → nullifier hash.
    mapping(address => bytes32) public walletToNullifier;

    /// @notice Total number of proposals ever created (used as next proposal ID).
    uint256 public proposalCount;

    /// @notice All proposals indexed by their ID.
    mapping(uint256 => Proposal) public proposals;

    /// @notice Per-proposal per-nullifier vote record.
    mapping(uint256 => mapping(bytes32 => bool)) public hasVoted;

    // ──────────────────────────────────────────────────────────────── errors ──

    /// @notice Thrown when a caller does not hold a live human verification.
    error NotHuman();

    /// @notice Thrown when a nullifier tries to vote a second time on the same proposal.
    error AlreadyVoted();

    /// @notice Thrown when an action targets a proposal that is not in ACTIVE status.
    error ProposalNotActive();

    /// @notice Thrown when a vote is cast after the proposal's voting window has closed.
    error VotingEnded();

    /// @notice Thrown when a proposal ID does not exist.
    error InvalidProposal();

    /// @notice Thrown when ccipReceive is called by an address other than the CCIP router.
    error NotCCIPRouter();

    /// @notice Thrown when finalizeProposal is called before the voting period ends.
    error VotingPeriodNotEnded();

    /// @notice Thrown when a proposal has already been finalized.
    error AlreadyFinalized();

    // ──────────────────────────────────────────────────────────────── events ──

    /// @notice Emitted when human status is received and recorded via CCIP.
    /// @param nullifier  The World-ID nullifier hash.
    /// @param wallet     The wallet address associated with this nullifier.
    /// @param expiry     Unix timestamp at which the status expires.
    event HumanStatusReceived(
        bytes32 indexed nullifier,
        address indexed wallet,
        uint256 expiry
    );

    /// @notice Emitted when a new governance proposal is created.
    /// @param proposalId  The unique proposal identifier.
    /// @param title       Short title of the proposal.
    /// @param proposer    Address of the human who created the proposal.
    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address proposer
    );

    /// @notice Emitted when a human casts a vote.
    /// @param proposalId  The proposal being voted on.
    /// @param nullifier   The voter's nullifier hash.
    /// @param support     True for yes, false for no.
    event Voted(
        uint256 indexed proposalId,
        bytes32 indexed nullifier,
        bool support
    );

    /// @notice Emitted when a proposal's voting period is finalized.
    /// @param proposalId  The finalized proposal.
    /// @param status      The resulting status (PASSED or FAILED).
    /// @param yes         Total yes votes.
    /// @param no          Total no votes.
    event ProposalFinalized(
        uint256 indexed proposalId,
        ProposalStatus status,
        uint256 yes,
        uint256 no
    );

    // ───────────────────────────────────────────────────────────────── enums ──

    /// @notice Lifecycle states of a governance proposal.
    enum ProposalStatus {
        ACTIVE,
        PASSED,
        FAILED,
        EXECUTED
    }

    // ─────────────────────────────────────────────────────────────── structs ──

    /// @notice Full data for a single governance proposal.
    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
        ProposalStatus status;
    }

    // ─────────────────────────────────────────────────────────── constructor ──

    /**
     * @param _ccipRouter Chainlink CCIP router address on Base Sepolia.
     */
    constructor(address _ccipRouter) Ownable(msg.sender) {
        ccipRouter = _ccipRouter;
    }

    // ──────────────────────────────────────────────────── external functions ──

    /**
     * @notice Entry point for Chainlink CCIP messages.
     * @dev Only the CCIP router may call this function. Decodes the payload
     *      (nullifier, wallet, expiry) and updates human-status mappings.
     * @param message The Any2EVMMessage delivered by the CCIP router.
     */
    function ccipReceive(
        Client.Any2EVMMessage calldata message
    ) external override {
        if (msg.sender != ccipRouter) revert NotCCIPRouter();

        (bytes32 nullifier, address wallet, uint256 expiry) = abi.decode(
            message.data,
            (bytes32, address, uint256)
        );

        verifiedHumans[nullifier] = true;
        humanExpiry[nullifier] = expiry;
        nullifierToWallet[nullifier] = wallet;
        walletToNullifier[wallet] = nullifier;

        emit HumanStatusReceived(nullifier, wallet, expiry);
    }

    /**
     * @notice ERC-165 interface detection.
     * @param interfaceId The interface identifier to check.
     * @return True if this contract implements the given interface.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == type(IAny2EVMMessageReceiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    /**
     * @notice Create a new governance proposal.
     * @dev Caller must be a verified human. Voting starts immediately.
     * @param title          A short human-readable title.
     * @param description    A detailed description of the proposal.
     * @param votingDuration Duration in seconds that voting remains open.
     */
    function createProposal(
        string calldata title,
        string calldata description,
        uint256 votingDuration
    ) external nonReentrant {
        if (!isHuman(msg.sender)) revert NotHuman();

        uint256 proposalId = proposalCount;
        proposalCount++;

        proposals[proposalId] = Proposal({
            id: proposalId,
            title: title,
            description: description,
            proposer: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + votingDuration,
            yesVotes: 0,
            noVotes: 0,
            executed: false,
            status: ProposalStatus.ACTIVE
        });

        emit ProposalCreated(proposalId, title, msg.sender);
    }

    /**
     * @notice Cast a vote on an active proposal.
     * @dev One vote per human (tracked by nullifier). Reverts after voting window ends.
     * @param proposalId The ID of the proposal to vote on.
     * @param support    True to vote yes, false to vote no.
     */
    function vote(
        uint256 proposalId,
        bool support
    ) external nonReentrant {
        if (!isHuman(msg.sender)) revert NotHuman();
        if (proposalId >= proposalCount) revert InvalidProposal();

        Proposal storage proposal = proposals[proposalId];

        if (proposal.status != ProposalStatus.ACTIVE) revert ProposalNotActive();
        if (block.timestamp > proposal.endTime) revert VotingEnded();

        bytes32 nullifier = walletToNullifier[msg.sender];
        if (hasVoted[proposalId][nullifier]) revert AlreadyVoted();

        hasVoted[proposalId][nullifier] = true;

        if (support) {
            proposal.yesVotes++;
        } else {
            proposal.noVotes++;
        }

        emit Voted(proposalId, nullifier, support);
    }

    /**
     * @notice Finalize a proposal after its voting window has ended.
     * @dev Sets the status to PASSED if yesVotes > noVotes, otherwise FAILED.
     *      Anyone may call this function once the voting period is over.
     * @param proposalId The ID of the proposal to finalize.
     */
    function finalizeProposal(uint256 proposalId) external {
        if (proposalId >= proposalCount) revert InvalidProposal();

        Proposal storage proposal = proposals[proposalId];
        if (block.timestamp <= proposal.endTime) revert VotingPeriodNotEnded();
        if (proposal.status != ProposalStatus.ACTIVE) revert AlreadyFinalized();

        ProposalStatus result = proposal.yesVotes > proposal.noVotes
            ? ProposalStatus.PASSED
            : ProposalStatus.FAILED;

        proposal.status = result;

        emit ProposalFinalized(
            proposalId,
            result,
            proposal.yesVotes,
            proposal.noVotes
        );
    }

    /**
     * @notice Check whether a wallet currently qualifies as a verified human.
     * @param wallet The wallet address to check.
     * @return True if the wallet has a live, non-expired human verification.
     */
    function isHuman(address wallet) public view returns (bool) {
        bytes32 nullifier = walletToNullifier[wallet];
        if (nullifier == bytes32(0)) return false;
        if (!verifiedHumans[nullifier]) return false;
        return humanExpiry[nullifier] > block.timestamp;
    }

    /**
     * @notice Retrieve the full Proposal struct for a given ID.
     * @param id The proposal ID.
     * @return The Proposal struct.
     */
    function getProposal(uint256 id) external view returns (Proposal memory) {
        if (id >= proposalCount) revert InvalidProposal();
        return proposals[id];
    }

    /**
     * @notice Get the human-verification status details for a wallet.
     * @param wallet The wallet address to query.
     * @return verified Whether the wallet is currently a verified human.
     * @return expiry   The Unix timestamp at which the status expires (0 if none).
     */
    function getHumanStatus(
        address wallet
    ) external view returns (bool verified, uint256 expiry) {
        bytes32 nullifier = walletToNullifier[wallet];
        if (nullifier == bytes32(0)) return (false, 0);
        verified = verifiedHumans[nullifier] && humanExpiry[nullifier] > block.timestamp;
        expiry = humanExpiry[nullifier];
    }
}
