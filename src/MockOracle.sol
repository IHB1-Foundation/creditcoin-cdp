// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

/**
 * @title MockOracle
 * @notice Simple mock oracle that returns a pseudo-random price between $0.52 and $0.58
 * @dev Price is expressed with 18 decimals, derived deterministically from block.timestamp
 *      This is only for testing/demo purposes and NOT secure randomness.
 */
contract MockOracle {
    uint256 private constant PRECISION = 1e18;
    uint256 private constant MIN_PRICE = 52e16; // 0.52 * 1e18
    uint256 private constant RANGE = 6e16;      // 0.06 * 1e18 (so max is 0.58 * 1e18)

    /**
     * @notice Get the current mock price
     * @return currentPrice Pseudo-random price in USD with 18 decimals
     */
    function getPrice() external view returns (uint256 currentPrice) {
        // Derive a pseudo-random offset within [0, RANGE] from the current timestamp
        uint256 offset = uint256(keccak256(abi.encodePacked(block.timestamp))) % (RANGE + 1);
        return MIN_PRICE + offset;
    }

    /**
     * @notice Mock freshness check
     * @return fresh Always true for the mock
     */
    function isFresh() external pure returns (bool fresh) {
        return true;
    }
}

