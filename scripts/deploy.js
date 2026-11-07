/**
 * Script de déploiement — Argonath PoC
 *
 * Hedera EVM testnet (cible principale) :
 *   HEDERA_PRIVATE_KEY=0x<key> HEDERA_ACCOUNT_ID=0.0.XXXX \
 *   npx hardhat run scripts/deploy.js --network hedera_testnet
 *
 * Local (Hardhat node, dev) :
 *   npx hardhat node
 *   npx hardhat run scripts/deploy.js --network localhost
 *
 * Met à jour automatiquement app/.env et backend/.env.
 */

const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const isHedera = network.name === 'hedera_testnet';
const rpcUrl   = isHedera ? 'https://testnet.hashio.io/api' : 'http://127.0.0.1:8545';

// Gas overrides for Hedera testnet (minimum ~1 HBAR/tx fee)
const GAS_PRICE = isHedera ? ethers.parseUnits("1200", "gwei") : undefined;
const TX_OPTS       = isHedera ? { gasLimit: 1_000_000, gasPrice: GAS_PRICE } : {};
const TX_OPTS_LARGE = isHedera ? { gasLimit: 4_000_000, gasPrice: GAS_PRICE } : {};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Network  :", network.name);
  console.log("Deployer :", deployer.address);

  // 1. MockCash (wMGA ERC-20)
  const MockCash = await ethers.getContractFactory("MockCash");
  const mockCash = await MockCash.deploy(TX_OPTS);
  await mockCash.waitForDeployment();
  console.log("MockCash     :", await mockCash.getAddress());

  // 2. ClaimRegistry (sans BondToken — HTS géré par le backend)
  const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
  const claimRegistry = await ClaimRegistry.deploy(TX_OPTS);
  await claimRegistry.waitForDeployment();
  console.log("ClaimRegistry:", await claimRegistry.getAddress());

  // 3. BondMetadata (registre des maturités, lu par RepoEscrow)
  const BondMetadata = await ethers.getContractFactory("BondMetadata");
  const bondMetadata = await BondMetadata.deploy(TX_OPTS);
  await bondMetadata.waitForDeployment();
  const bondMetadataAddr = await bondMetadata.getAddress();
  console.log("BondMetadata :", bondMetadataAddr);

  // 4. RepoEscrow (utilise MockCash pour le collatéral cash)
  const RepoEscrow = await ethers.getContractFactory("RepoEscrow");
  const repoEscrow = await RepoEscrow.deploy(
    deployer.address,          // placeholder pour BondToken (sera remplacé par HTS)
    await mockCash.getAddress(),
    bondMetadataAddr,
    TX_OPTS_LARGE
  );
  await repoEscrow.waitForDeployment();
  console.log("RepoEscrow   :", await repoEscrow.getAddress());

  // 5. RepoReceiptNFT (ERC-721 lié à RepoEscrow)
  const RepoReceiptNFT = await ethers.getContractFactory("RepoReceiptNFT");
  const repoReceipt = await RepoReceiptNFT.deploy(await repoEscrow.getAddress(), TX_OPTS);
  await repoReceipt.waitForDeployment();
  let repoReceiptAddr = await repoReceipt.getAddress();
  console.log("RepoReceipt  :", repoReceiptAddr);
  await (await repoEscrow.setRepoReceipt(repoReceiptAddr, TX_OPTS)).wait();
  console.log("  -> RepoReceipt lié à RepoEscrow");

  // 6. Mint des wMGA de test
  await mockCash.mint(deployer.address, ethers.parseUnits("1000000", 6), TX_OPTS);
  console.log("Minted 1M wMGA au deployer");

  const addresses = {
    MockCash:       await mockCash.getAddress(),
    ClaimRegistry:  await claimRegistry.getAddress(),
    BondMetadata:   bondMetadataAddr,
    RepoEscrow:     await repoEscrow.getAddress(),
    RepoReceiptNFT: repoReceiptAddr,
  };

  // 7. Créer le token HTS ARGN sur Hedera testnet
  let htsTokenId  = '';
  let htsEvmAddr  = '';

  if (isHedera) {
    console.log("\nCréation du token HTS ARGN...");
    const { createArgonathToken, tokenIdToEvmAddress } = require('../backend/src/services/hts');
    htsTokenId = await createArgonathToken();
    htsEvmAddr = tokenIdToEvmAddress(htsTokenId);
    console.log("HTS Token ID :", htsTokenId);
    console.log("HTS EVM addr :", htsEvmAddr);
    console.log("HashScan     : https://hashscan.io/testnet/token/" + htsTokenId);

    // 7b. Redéployer RepoEscrow avec le vrai bondToken HTS (fix placeholder)
    console.log("\nRedéploiement de RepoEscrow avec bondToken HTS...");
    const RepoEscrow2 = await ethers.getContractFactory("RepoEscrow");
    const repoEscrow2 = await RepoEscrow2.deploy(htsEvmAddr, await mockCash.getAddress(), bondMetadataAddr, TX_OPTS_LARGE);
    await repoEscrow2.waitForDeployment();
    addresses.RepoEscrow = await repoEscrow2.getAddress();
    console.log("RepoEscrow (v2):", addresses.RepoEscrow);

    // 7c. RepoReceiptNFT doit pointer vers le nouveau RepoEscrow
    const RepoReceiptNFT2 = await ethers.getContractFactory("RepoReceiptNFT");
    const repoReceipt2 = await RepoReceiptNFT2.deploy(addresses.RepoEscrow, TX_OPTS);
    await repoReceipt2.waitForDeployment();
    repoReceiptAddr = await repoReceipt2.getAddress();
    addresses.RepoReceiptNFT = repoReceiptAddr;
    await (await repoEscrow2.setRepoReceipt(repoReceiptAddr, TX_OPTS)).wait();
    console.log("RepoReceipt (v2):", repoReceiptAddr);
  }

  // 8. Met à jour app/.env
  const appEnv = {
    REACT_APP_MOCK_CASH_ADDRESS:      addresses.MockCash,
    REACT_APP_CLAIM_REGISTRY_ADDRESS: addresses.ClaimRegistry,
    REACT_APP_BOND_TOKEN_ADDRESS:     htsEvmAddr || addresses.MockCash, // HTS EVM addr pour balanceOf
    REACT_APP_REPO_ESCROW_ADDRESS:    addresses.RepoEscrow,
    REACT_APP_BOND_METADATA_ADDRESS:  addresses.BondMetadata,
    REACT_APP_REPO_RECEIPT_ADDRESS:   addresses.RepoReceiptNFT,
    REACT_APP_RPC_URL:                rpcUrl,
    REACT_APP_CHAIN_ID:               isHedera ? '0x128' : '0x7a69',
    REACT_APP_HASHSCAN_URL:           isHedera ? 'https://hashscan.io/testnet/transaction/' : '',
  };
  if (htsTokenId) appEnv.REACT_APP_HTS_TOKEN_ID = htsTokenId;
  updateEnv(path.join(__dirname, "../app/.env"), appEnv);

  // 9. Met à jour backend/.env
  const backendEnv = {
    CLAIM_REGISTRY_ADDRESS: addresses.ClaimRegistry,
    BOND_METADATA_ADDRESS:  addresses.BondMetadata,
    RPC_URL: rpcUrl,
  };
  if (isHedera && process.env.HEDERA_PRIVATE_KEY) {
    backendEnv.ADMIN_PRIVATE_KEY   = process.env.HEDERA_PRIVATE_KEY;
    backendEnv.HEDERA_PRIVATE_KEY  = process.env.HEDERA_PRIVATE_KEY;
    backendEnv.HEDERA_ACCOUNT_ID   = process.env.HEDERA_ACCOUNT_ID || '';
  }
  if (htsTokenId) backendEnv.HTS_TOKEN_ID = htsTokenId;
  updateEnv(path.join(__dirname, "../backend/.env"), backendEnv);

  console.log("\n✓ app/.env mis à jour");
  console.log("✓ backend/.env mis à jour");
  console.log("✓ Déploiement terminé !\n");
  console.log(JSON.stringify({ ...addresses, htsTokenId, htsEvmAddr }, null, 2));
  if (isHedera) {
    console.log("\nHashScan ClaimRegistry :", `https://hashscan.io/testnet/contract/${addresses.ClaimRegistry}`);
    console.log("HashScan Token ARGN    :", `https://hashscan.io/testnet/token/${htsTokenId}`);
  }
}

function updateEnv(filePath, vars) {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  }
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*`, "m");
    const line  = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.endsWith("\n") ? "" : "\n") + line + "\n";
    }
  }
  fs.writeFileSync(filePath, content, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
