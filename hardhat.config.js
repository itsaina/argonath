require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { evmVersion: "paris" },
  },
  networks: {
    // Hardhat local node (développement)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Hedera EVM testnet (nécessite HBAR de test)
    // Obtenir des HBAR testnet : https://portal.hedera.com/
    hedera_testnet: {
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      gas: 1000000,
      gasPrice: 1200000000000, // 1200 Gwei — couvre le fee minimum Hedera testnet (~1 HBAR/tx)
    },
  },
};
