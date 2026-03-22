// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title BondToken — Titre financier tokenisé (ERC-20 / HTS-compatible)
/// @dev 0 décimales : 1 ARGN = 1 titre. Compatible HTS via ERC-20 interface.
contract BondToken is ERC20, Ownable {
    address public registry;

    event RegistrySet(address indexed registry);

    constructor() ERC20("Argonath Bond", "ARGN") Ownable(msg.sender) {}

    /// @dev 0 décimales : 1 ARGN = 1 unité de titre
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    modifier onlyRegistry() {
        require(msg.sender == registry, "BondToken: caller is not registry");
        _;
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = _registry;
        emit RegistrySet(_registry);
    }

    /// @notice Mint des ARGN vers un investisseur (appelé par ClaimRegistry)
    function mint(address to, uint256 amount) external onlyRegistry {
        _mint(to, amount);
    }
}
