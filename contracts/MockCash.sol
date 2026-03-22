// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockCash — wMGA simulé (ERC-20 avec faucet public)
contract MockCash is ERC20 {
    uint8 private _decimals;

    constructor() ERC20("Wrapped MGA", "wMGA") {
        _decimals = 6;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Faucet public — chacun peut se mint des wMGA pour les tests
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
