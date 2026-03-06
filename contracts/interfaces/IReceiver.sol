// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IReceiver
 * @notice Minimal Chainlink workflow receiver interface for `writeReport` delivery.
 */
interface IReceiver is IERC165 {
    /**
     * @notice Called by the Chainlink forwarder with workflow metadata + DON-signed report bytes.
     */
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
