// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClaimRegistry — Registre on-chain des droits de redeem
/// @dev Le minting HTS est géré off-chain par le backend (Hedera SDK).
///      Ce contrat gère uniquement l'autorisation et la preuve de redeem.
contract ClaimRegistry is Ownable {

    /// @notice claimId → wallet autorisé à redeem
    mapping(bytes32 => address) public authorizedWallet;

    /// @notice claimId → déjà redeemed
    mapping(bytes32 => bool) public redeemed;

    event ClaimAuthorized(bytes32 indexed claimId, address indexed wallet);
    event ClaimRedeemed(bytes32 indexed claimId, address indexed wallet, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /// @notice Le backend (owner) autorise un wallet à redeem un claim
    function authorize(bytes32 claimId, address wallet) external onlyOwner {
        authorizedWallet[claimId] = wallet;
        emit ClaimAuthorized(claimId, wallet);
    }

    /// @notice L'investisseur prouve son droit — HTS minting déclenché off-chain
    function redeem(bytes32 claimId, uint256 amount) external {
        require(authorizedWallet[claimId] == msg.sender, "ClaimRegistry: not authorized");
        require(!redeemed[claimId], "ClaimRegistry: already redeemed");
        redeemed[claimId] = true;
        emit ClaimRedeemed(claimId, msg.sender, amount);
    }
}
