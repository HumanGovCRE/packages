// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockCCIPRouter
 * @notice Minimal CCIP router mock for unit tests. Returns a deterministic fee
 *         and echoes a mock message ID on ccipSend.
 */
contract MockCCIPRouter is IRouterClient {
    uint256 public constant MOCK_FEE = 0.01 ether;

    /// @dev Emitted so tests can inspect ccipSend calls.
    event MessageSent(
        uint64 destinationChainSelector,
        bytes32 messageId,
        address feeToken,
        uint256 feesPaid
    );

    /**
     * @inheritdoc IRouterClient
     */
    function getFee(
        uint64, /* destinationChainSelector */
        Client.EVM2AnyMessage memory /* message */
    ) external pure override returns (uint256) {
        return MOCK_FEE;
    }

    /**
     * @inheritdoc IRouterClient
     */
    function isChainSupported(uint64 /* chainSelector */)
        external
        pure
        override
        returns (bool)
    {
        return true;
    }

    /**
     * @inheritdoc IRouterClient
     */
    function ccipSend(
        uint64 destinationChainSelector,
        Client.EVM2AnyMessage calldata message
    ) external payable override returns (bytes32 messageId) {
        if (message.feeToken == address(0)) {
            require(msg.value >= MOCK_FEE, "MockCCIPRouter: insufficient native fee");
        } else {
            bool success = IERC20(message.feeToken).transferFrom(
                msg.sender,
                address(this),
                MOCK_FEE
            );
            require(success, "MockCCIPRouter: fee transfer failed");
        }

        messageId = keccak256(
            abi.encodePacked(
                destinationChainSelector,
                message.data,
                message.feeToken,
                block.timestamp,
                msg.sender
            )
        );
        emit MessageSent(
            destinationChainSelector,
            messageId,
            message.feeToken,
            message.feeToken == address(0) ? msg.value : MOCK_FEE
        );
    }
}
