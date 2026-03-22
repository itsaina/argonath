const { ethers } = require('ethers');

let wallet;

function getWallet() {
  if (!wallet) {
    const privateKey = process.env.BACKEND_PRIVATE_KEY;
    const isValid = privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey);
    if (isValid) {
      wallet = new ethers.Wallet(privateKey);
    } else {
      // Génère un wallet éphémère pour le PoC si aucune clé valide n'est configurée
      wallet = ethers.Wallet.createRandom();
      console.warn(`[signer] BACKEND_PRIVATE_KEY non configurée — wallet éphémère généré : ${wallet.address}`);
      console.warn(`[signer] Exportez cette clé dans .env : BACKEND_PRIVATE_KEY=${wallet.privateKey}`);
    }
  }
  return wallet;
}

/**
 * Retourne l'adresse publique du backend signer.
 * À enregistrer dans ClaimRegistry.sol au déploiement.
 */
function getSignerAddress() {
  return getWallet().address;
}

/**
 * Signe une autorisation de redeem pour un investisseur.
 * Le smart contract vérifie cette signature avec ECDSA.recover().
 *
 * Message signé : keccak256(abi.encodePacked(claimId, walletAddress, tokenId, expiry))
 *
 * @param {string} claimId       - bytes32 hex (ex: "0xabc...")
 * @param {string} walletAddress - adresse EVM de l'investisseur
 * @param {string} tokenId       - uint256 as string
 * @param {number} expiry        - Unix timestamp (secondes)
 */
async function signRedeemAuthorization(claimId, walletAddress, tokenId, expiry) {
  const message = ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'uint256', 'uint256'],
    [claimId, walletAddress, BigInt(tokenId), BigInt(expiry)]
  );
  // ethers v6 signMessage préfixe avec "\x19Ethereum Signed Message:\n32"
  const signature = await getWallet().signMessage(ethers.getBytes(message));
  return signature;
}

module.exports = { getSignerAddress, signRedeemAuthorization };
