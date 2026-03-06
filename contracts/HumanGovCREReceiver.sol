// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {HumanRegistry} from "./HumanRegistry.sol";

/**
 * @title HumanGovCREReceiver
 * @notice Receives DON-signed CRE reports and executes verification lifecycle actions
 *         against HumanRegistry.
 * @dev This contract is intended to be the `writeReport` receiver configured in the
 *      CRE workflow, then authorized inside `HumanRegistry` via `setAuthorizedCREWorkflow`.
 */
contract HumanGovCREReceiver is Ownable, IReceiver {
    // Workflow action constants encoded in report payload
    uint8 public constant ACTION_REGISTER = 1;
    uint8 public constant ACTION_REVOKE = 2;

    /// @notice Source registry that stores verification records and handles CCIP propagation.
    HumanRegistry public immutable registry;

    /// @notice Optional chainlink forwarder address allowed to call `onReport`.
    address public forwarderAddress;

    /// @notice Optional workflow owner validation from report metadata.
    address public expectedWorkflowOwner;

    /// @notice Optional workflow name validation from report metadata.
    bytes10 public expectedWorkflowName;

    error InvalidRegistry();
    error InvalidSender(address sender, address expected);
    error InvalidWorkflowOwner(address actual, address expected);
    error InvalidWorkflowName(bytes10 actual, bytes10 expected);
    error UnsupportedAction(uint8 action);

    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event ExpectedWorkflowOwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event ExpectedWorkflowNameUpdated(bytes10 indexed previousName, bytes10 indexed newName);

    event ReportProcessed(
        uint8 indexed action,
        bytes32 indexed nullifier,
        address indexed wallet,
        uint64 destinationChainSelector,
        bool propagated
    );

    constructor(
        address _registry,
        address _forwarderAddress,
        address _expectedWorkflowOwner,
        bytes10 _expectedWorkflowName
    ) Ownable(msg.sender) {
        if (_registry == address(0)) revert InvalidRegistry();

        registry = HumanRegistry(_registry);
        forwarderAddress = _forwarderAddress;
        expectedWorkflowOwner = _expectedWorkflowOwner;
        expectedWorkflowName = _expectedWorkflowName;
    }

    /**
     * @inheritdoc IReceiver
     * @dev Report payload encoding:
     *      (uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate)
     */
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (forwarderAddress != address(0) && msg.sender != forwarderAddress) {
            revert InvalidSender(msg.sender, forwarderAddress);
        }

        if (expectedWorkflowOwner != address(0) || expectedWorkflowName != bytes10(0)) {
            (, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

            if (expectedWorkflowOwner != address(0) && workflowOwner != expectedWorkflowOwner) {
                revert InvalidWorkflowOwner(workflowOwner, expectedWorkflowOwner);
            }
            if (expectedWorkflowName != bytes10(0) && workflowName != expectedWorkflowName) {
                revert InvalidWorkflowName(workflowName, expectedWorkflowName);
            }
        }

        (
            uint8 action,
            bytes32 nullifier,
            address wallet,
            uint64 destinationChainSelector,
            bool propagate
        ) = abi.decode(report, (uint8, bytes32, address, uint64, bool));

        bool propagated = false;

        if (action == ACTION_REGISTER) {
            registry.registerVerification(nullifier, wallet);
            if (propagate && destinationChainSelector != 0) {
                registry.propagateToChainWithLink(nullifier, destinationChainSelector);
                propagated = true;
            }
        } else if (action == ACTION_REVOKE) {
            registry.revokeVerification(nullifier);
        } else {
            revert UnsupportedAction(action);
        }

        emit ReportProcessed(action, nullifier, wallet, destinationChainSelector, propagated);
    }

    function setForwarderAddress(address newForwarder) external onlyOwner {
        address previous = forwarderAddress;
        forwarderAddress = newForwarder;
        emit ForwarderUpdated(previous, newForwarder);
    }

    function setExpectedWorkflowOwner(address newOwner) external onlyOwner {
        address previous = expectedWorkflowOwner;
        expectedWorkflowOwner = newOwner;
        emit ExpectedWorkflowOwnerUpdated(previous, newOwner);
    }

    function setExpectedWorkflowName(bytes10 newName) external onlyOwner {
        bytes10 previous = expectedWorkflowName;
        expectedWorkflowName = newName;
        emit ExpectedWorkflowNameUpdated(previous, newName);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // Metadata layout is packed by Chainlink forwarder as:
    // [workflowId:32][workflowName:10][workflowOwner:20]
    function _decodeMetadata(
        bytes memory metadata
    ) internal pure returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner) {
        assembly {
            workflowId := mload(add(metadata, 32))
            workflowName := mload(add(metadata, 64))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }
}
