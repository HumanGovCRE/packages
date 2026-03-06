// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title HumanRegistry
 * @notice Lives on Ethereum Sepolia. Receives World ID proof verifications forwarded
 *         by the CRE workflow and records verified-human status per nullifier hash.
 *         Sends cross-chain messages via Chainlink CCIP to update target chains.
 * @dev Authorized callers are set by the owner. Only the CRE workflow may register
 *      or revoke verifications; the owner may also revoke in emergency situations.
 */
contract HumanRegistry is Ownable {
    // ─────────────────────────────────────────────────────────── immutables ──

    /// @notice Chainlink CCIP router on Ethereum Sepolia.
    address public immutable ccipRouter;

    /// @notice LINK token used for optional fee payments.
    address public immutable linkToken;

    // ──────────────────────────────────────────────────────────── constants ──

    /// @notice How long a verification remains valid once registered.
    uint256 public constant VERIFICATION_DURATION = 180 days;

    /// @notice CCIP execution gas limit used when sending the cross-chain message.
    uint256 public constant CCIP_GAS_LIMIT = 200_000;

    // ───────────────────────────────────────────────────────────────── state ──

    /// @notice Whether a given nullifier hash has been consumed.
    mapping(bytes32 => bool) public verifiedNullifiers;

    /// @notice Timestamp at which each nullifier's verification expires.
    mapping(bytes32 => uint256) public verificationExpiry;

    /// @notice Maps a nullifier hash to the wallet address it was registered for.
    mapping(bytes32 => address) public nullifierToAddress;

    /// @notice Maps a wallet address to its associated nullifier hash.
    mapping(address => bytes32) public addressToNullifier;

    /// @notice The CRE workflow contract allowed to register/revoke verifications.
    address public authorizedCREWorkflow;

    /// @notice Per-chain receiver contract addresses for CCIP propagation.
    mapping(uint64 => address) public targetChainReceivers;

    // ──────────────────────────────────────────────────────────────── errors ──

    /// @notice Thrown when a nullifier has already been used for a verification.
    error DoubleClaim();

    /// @notice Thrown when a wallet already has an active, unexpired verification.
    error AlreadyVerified();

    /// @notice Thrown when the caller is not the authorized CRE workflow (or owner).
    error NotAuthorized();

    /// @notice Thrown when a zero nullifier is supplied.
    error InvalidNullifier();

    /// @notice Thrown when a zero wallet address is supplied.
    error InvalidWallet();

    /// @notice Thrown when the verification being queried has expired.
    error ExpiredVerification();

    /// @notice Thrown when no active verification exists for the given nullifier.
    error VerificationNotFound();

    /// @notice Thrown when no receiver is registered for the destination chain.
    error NoReceiverForChain();

    /// @notice Thrown when there is no LINK balance to withdraw.
    error NoLinkToWithdraw();

    /// @notice Thrown when native gas sent is insufficient for CCIP.
    error InsufficientNativeFee(uint256 requiredFee, uint256 providedFee);

    /// @notice Thrown when LINK balance held by this contract is insufficient for CCIP.
    error InsufficientLinkBalance(uint256 requiredFee, uint256 availableBalance);

    /// @notice Thrown when LINK approve fails.
    error LinkApproveFailed();

    // ──────────────────────────────────────────────────────────────── events ──

    /// @notice Emitted when a human is successfully verified.
    /// @param nullifier  The World-ID nullifier hash.
    /// @param wallet     The wallet address linked to the verification.
    /// @param expiry     Unix timestamp at which the verification expires.
    event HumanVerified(
        bytes32 indexed nullifier,
        address indexed wallet,
        uint256 expiry
    );

    /// @notice Emitted when a verification is revoked.
    /// @param nullifier The nullifier hash whose verification was removed.
    event VerificationRevoked(bytes32 indexed nullifier);

    /// @notice Emitted after a successful CCIP cross-chain propagation.
    /// @param nullifier              The propagated nullifier hash.
    /// @param destinationChainSelector Chainlink CCIP chain selector of the target chain.
    /// @param messageId              The CCIP message ID returned by the router.
    event CrossChainPropagated(
        bytes32 indexed nullifier,
        uint64 destinationChainSelector,
        bytes32 messageId
    );

    // ─────────────────────────────────────────────────────────────── structs ──

    /// @notice Full verification record for a wallet.
    struct VerificationRecord {
        bytes32 nullifier;
        address wallet;
        uint256 expiry;
        bool active;
    }

    // ──────────────────────────────────────────────────────────── modifiers ──

    /// @dev Allows either the authorized CRE workflow or the contract owner.
    modifier onlyAuthorizedOrOwner() {
        if (msg.sender != authorizedCREWorkflow && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    // ─────────────────────────────────────────────────────────── constructor ──

    /**
     * @param _ccipRouter  Chainlink CCIP router address on this chain.
     * @param _linkToken   LINK token address on this chain.
     */
    constructor(address _ccipRouter, address _linkToken) Ownable(msg.sender) {
        ccipRouter = _ccipRouter;
        linkToken = _linkToken;
    }

    // ──────────────────────────────────────────────────── external functions ──

    /**
     * @notice Register a World-ID-verified human.
     * @dev Only callable by the authorized CRE workflow.
     *      Reverts with DoubleClaim if the nullifier was already consumed,
     *      or AlreadyVerified if the wallet already has a live verification.
     * @param nullifier The World-ID nullifier hash produced by the ZK proof.
     * @param wallet    The wallet address to associate with this verification.
     */
    function registerVerification(
        bytes32 nullifier,
        address wallet
    ) external {
        if (msg.sender != authorizedCREWorkflow) revert NotAuthorized();
        if (nullifier == bytes32(0)) revert InvalidNullifier();
        if (wallet == address(0)) revert InvalidWallet();
        if (verifiedNullifiers[nullifier]) revert DoubleClaim();

        bytes32 existingNullifier = addressToNullifier[wallet];
        if (
            existingNullifier != bytes32(0) &&
            verifiedNullifiers[existingNullifier] &&
            verificationExpiry[existingNullifier] > block.timestamp
        ) {
            revert AlreadyVerified();
        }

        uint256 expiry = block.timestamp + VERIFICATION_DURATION;

        verifiedNullifiers[nullifier] = true;
        verificationExpiry[nullifier] = expiry;
        nullifierToAddress[nullifier] = wallet;
        addressToNullifier[wallet] = nullifier;

        emit HumanVerified(nullifier, wallet, expiry);
    }

    /**
     * @notice Revoke an existing verification record.
     * @dev Callable by the authorized CRE workflow or the contract owner.
     * @param nullifier The nullifier hash to revoke.
     */
    function revokeVerification(
        bytes32 nullifier
    ) external onlyAuthorizedOrOwner {
        address wallet = nullifierToAddress[nullifier];

        delete verifiedNullifiers[nullifier];
        delete verificationExpiry[nullifier];
        delete nullifierToAddress[nullifier];
        if (wallet != address(0)) {
            delete addressToNullifier[wallet];
        }

        emit VerificationRevoked(nullifier);
    }

    /**
     * @notice Propagate a verification to a target chain via Chainlink CCIP.
     * @dev Pays the CCIP fee in native ETH. Any excess ETH is NOT refunded by this
     *      function — callers should compute the fee via IRouterClient.getFee first.
     * @param nullifier               The nullifier hash to propagate.
     * @param destinationChainSelector Chainlink CCIP chain selector of the target chain.
     */
    function propagateToChain(
        bytes32 nullifier,
        uint64 destinationChainSelector
    ) external payable onlyAuthorizedOrOwner {
        Client.EVM2AnyMessage memory ccipMessage = _buildCcipMessage(
            nullifier,
            destinationChainSelector,
            address(0)
        );

        uint256 requiredFee = IRouterClient(ccipRouter).getFee(
            destinationChainSelector,
            ccipMessage
        );
        if (msg.value < requiredFee) {
            revert InsufficientNativeFee(requiredFee, msg.value);
        }

        bytes32 messageId = IRouterClient(ccipRouter).ccipSend{value: msg.value}(
            destinationChainSelector,
            ccipMessage
        );

        emit CrossChainPropagated(nullifier, destinationChainSelector, messageId);
    }

    /**
     * @notice Propagate a verification to a target chain via Chainlink CCIP using LINK for fees.
     * @dev This method is designed for CRE receiver contracts that call via `onReport` and
     *      therefore cannot attach native `msg.value`.
     * @param nullifier               The nullifier hash to propagate.
     * @param destinationChainSelector Chainlink CCIP chain selector of the target chain.
     * @return messageId The CCIP message ID.
     * @return feePaid   The LINK fee charged by the router.
     */
    function propagateToChainWithLink(
        bytes32 nullifier,
        uint64 destinationChainSelector
    )
        external
        onlyAuthorizedOrOwner
        returns (bytes32 messageId, uint256 feePaid)
    {
        Client.EVM2AnyMessage memory ccipMessage = _buildCcipMessage(
            nullifier,
            destinationChainSelector,
            linkToken
        );

        feePaid = IRouterClient(ccipRouter).getFee(
            destinationChainSelector,
            ccipMessage
        );

        uint256 linkBalance = IERC20(linkToken).balanceOf(address(this));
        if (linkBalance < feePaid) {
            revert InsufficientLinkBalance(feePaid, linkBalance);
        }

        if (!IERC20(linkToken).approve(ccipRouter, 0)) revert LinkApproveFailed();
        if (!IERC20(linkToken).approve(ccipRouter, feePaid)) revert LinkApproveFailed();

        messageId = IRouterClient(ccipRouter).ccipSend(
            destinationChainSelector,
            ccipMessage
        );

        emit CrossChainPropagated(nullifier, destinationChainSelector, messageId);
    }

    /**
     * @notice Quote the native gas fee required for propagating a verification.
     */
    function quotePropagationFeeNative(
        bytes32 nullifier,
        uint64 destinationChainSelector
    ) external view returns (uint256) {
        Client.EVM2AnyMessage memory ccipMessage = _buildCcipMessage(
            nullifier,
            destinationChainSelector,
            address(0)
        );
        return IRouterClient(ccipRouter).getFee(destinationChainSelector, ccipMessage);
    }

    /**
     * @notice Quote the LINK fee required for propagating a verification.
     */
    function quotePropagationFeeInLink(
        bytes32 nullifier,
        uint64 destinationChainSelector
    ) external view returns (uint256) {
        Client.EVM2AnyMessage memory ccipMessage = _buildCcipMessage(
            nullifier,
            destinationChainSelector,
            linkToken
        );
        return IRouterClient(ccipRouter).getFee(destinationChainSelector, ccipMessage);
    }

    /**
     * @notice Returns whether the given wallet currently holds a valid verification.
     * @param wallet The wallet address to check.
     * @return True if the wallet is verified and the verification has not expired.
     */
    function isHuman(address wallet) external view returns (bool) {
        bytes32 nullifier = addressToNullifier[wallet];
        if (nullifier == bytes32(0)) return false;
        if (!verifiedNullifiers[nullifier]) return false;
        return verificationExpiry[nullifier] > block.timestamp;
    }

    /**
     * @notice Returns the full verification record for a wallet.
     * @param wallet The wallet address to query.
     * @return record A VerificationRecord struct with all details.
     */
    function getVerification(
        address wallet
    ) external view returns (VerificationRecord memory record) {
        bytes32 nullifier = addressToNullifier[wallet];
        bool active = nullifier != bytes32(0) &&
            verifiedNullifiers[nullifier] &&
            verificationExpiry[nullifier] > block.timestamp;

        record = VerificationRecord({
            nullifier: nullifier,
            wallet: wallet,
            expiry: verificationExpiry[nullifier],
            active: active
        });
    }

    /**
     * @notice Set the authorized CRE workflow address.
     * @param workflow The new authorized workflow contract address.
     */
    function setAuthorizedCREWorkflow(address workflow) external onlyOwner {
        authorizedCREWorkflow = workflow;
    }

    /**
     * @notice Register a receiver contract on a destination chain.
     * @param chainSelector Chainlink CCIP chain selector of the destination.
     * @param receiver      Address of the receiver contract on the destination chain.
     */
    function setTargetChainReceiver(
        uint64 chainSelector,
        address receiver
    ) external onlyOwner {
        targetChainReceivers[chainSelector] = receiver;
    }

    /**
     * @notice Withdraw any LINK tokens held by this contract to the owner.
     */
    function withdrawLink() external onlyOwner {
        uint256 balance = IERC20(linkToken).balanceOf(address(this));
        if (balance == 0) revert NoLinkToWithdraw();
        IERC20(linkToken).transfer(owner(), balance);
    }

    // ─────────────────────────────────────────────────── internal functions ──

    function _buildCcipMessage(
        bytes32 nullifier,
        uint64 destinationChainSelector,
        address feeToken
    ) internal view returns (Client.EVM2AnyMessage memory ccipMessage) {
        address receiver = targetChainReceivers[destinationChainSelector];
        if (receiver == address(0)) revert NoReceiverForChain();
        if (!verifiedNullifiers[nullifier]) revert VerificationNotFound();

        bytes memory data = abi.encode(
            nullifier,
            nullifierToAddress[nullifier],
            verificationExpiry[nullifier]
        );

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](0);

        ccipMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: data,
            tokenAmounts: tokenAmounts,
            feeToken: feeToken,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: CCIP_GAS_LIMIT})
            )
        });
    }
}
