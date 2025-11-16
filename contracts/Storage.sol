// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Basic storage contract used for Paseo TestNet integration
/// @notice Stores an unsigned integer that can be updated on-chain
contract Storage {
    uint256 private storedNumber;

    event NumberUpdated(uint256 newValue, address indexed updatedBy);

    /// @notice Persist a new number on-chain
    /// @param newNumber Value that will replace the current stored number
    function store(uint256 newNumber) external {
        storedNumber = newNumber;
        emit NumberUpdated(newNumber, msg.sender);
    }

    /// @notice Retrieve the last stored number without changing the state
    /// @return The latest stored number
    function retrieve() external view returns (uint256) {
        return storedNumber;
    }
}
