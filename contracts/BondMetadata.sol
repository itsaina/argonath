// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BondMetadata
 * @notice Registre on-chain des maturités de bonds par wallet.
 *         Seul le dépositaire (owner) peut renseigner les maturités,
 *         au moment du mint ARGN. RepoEscrow lit ce registre pour
 *         valider les demandes de repo sans demander la date à l'user.
 *
 * Règle : setMaturity conserve la date la plus proche (minimum).
 *         refreshMaturity permet au dépositaire de mettre à jour
 *         après expiration d'un lot.
 */
contract BondMetadata is Ownable {

    /// @notice Maturité la plus proche enregistrée pour chaque wallet
    mapping(address => uint256) public bondMaturity;

    event MaturitySet(address indexed wallet, uint256 maturityTs);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Enregistre (ou met à jour vers la date la plus proche)
     *         la maturité des bonds d'un wallet.
     *         Appelé par le backend après chaque mint ARGN.
     */
    function setMaturity(address wallet, uint256 maturityTs) external onlyOwner {
        if (bondMaturity[wallet] == 0 || maturityTs < bondMaturity[wallet]) {
            bondMaturity[wallet] = maturityTs;
            emit MaturitySet(wallet, maturityTs);
        }
    }

    /**
     * @notice Écrase la maturité d'un wallet (correction par le dépositaire,
     *         ex. après expiration d'un lot et renouvellement).
     */
    function refreshMaturity(address wallet, uint256 maturityTs) external onlyOwner {
        bondMaturity[wallet] = maturityTs;
        emit MaturitySet(wallet, maturityTs);
    }

    /// @notice Retourne la maturité enregistrée (0 si aucune)
    function getMaturity(address wallet) external view returns (uint256) {
        return bondMaturity[wallet];
    }
}
