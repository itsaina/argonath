/**
 * Déploiement LOCAL complet — chaîne Hardhat uniquement.
 *
 *   npx hardhat node
 *   npx hardhat run scripts/deploy-local.js --network localhost
 *
 * Pourquoi un script distinct de deploy.js :
 *
 *  - deploy.js cible Hedera, où le token ARGN est un token HTS créé par le SDK
 *    et minté par le backend. Hors Hedera, il passe l'adresse du déployeur comme
 *    bondToken de RepoEscrow — un simple EOA. Tout transferFrom de collatéral
 *    échoue donc, et les parcours repo sont intestables en local.
 *
 *  - ClaimRegistry n'appelle jamais BondToken.mint : sur Hedera, le mint est
 *    déclenché hors chaîne par le backend après l'événement ClaimRedeemed. On
 *    reproduit ce rôle en pointant BondToken.registry sur l'admin backend
 *    (compte #0 de Hardhat, celui de ADMIN_PRIVATE_KEY), qui peut donc minter.
 *
 * Optionnel : FUND=0xAdresse pour doter un wallet (ETH de gas, wMGA, ARGN et
 * une maturité de bon), afin de tester les parcours wallet depuis MetaMask.
 */
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = "0x7a69";

async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`Script réservé à la chaîne locale (réseau reçu : ${network.name})`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer :", deployer.address);

  // 1. wMGA — cash du repo, faucet public
  const MockCash = await ethers.getContractFactory("MockCash");
  const cash = await MockCash.deploy();
  await cash.waitForDeployment();
  const cashAddr = await cash.getAddress();
  console.log("MockCash (wMGA) :", cashAddr);

  // 2. ARGN — vrai ERC-20, minté par l'admin backend en lieu et place du HTS
  const BondToken = await ethers.getContractFactory("BondToken");
  const argn = await BondToken.deploy();
  await argn.waitForDeployment();
  const argnAddr = await argn.getAddress();
  await (await argn.setRegistry(deployer.address)).wait();
  console.log("BondToken (ARGN):", argnAddr, "— registry =", deployer.address);

  // 3. Registre des droits de redeem
  const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
  const registry = await ClaimRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("ClaimRegistry   :", registryAddr);

  // 4. Registre des maturités, lu par RepoEscrow
  const BondMetadata = await ethers.getContractFactory("BondMetadata");
  const meta = await BondMetadata.deploy();
  await meta.waitForDeployment();
  const metaAddr = await meta.getAddress();
  console.log("BondMetadata    :", metaAddr);

  // 5. Escrow repo — cette fois avec un vrai token de collatéral
  const RepoEscrow = await ethers.getContractFactory("RepoEscrow");
  const escrow = await RepoEscrow.deploy(argnAddr, cashAddr, metaAddr);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("RepoEscrow      :", escrowAddr);

  // 6. Reçu de repo, lié à l'escrow
  const RepoReceiptNFT = await ethers.getContractFactory("RepoReceiptNFT");
  const receipt = await RepoReceiptNFT.deploy(escrowAddr);
  await receipt.waitForDeployment();
  const receiptAddr = await receipt.getAddress();
  await (await escrow.setRepoReceipt(receiptAddr)).wait();
  console.log("RepoReceiptNFT  :", receiptAddr);

  await (await cash.mint(deployer.address, ethers.parseUnits("1000000", 6))).wait();
  console.log("1 000 000 wMGA mintés au déployeur");

  // 7. Dotation optionnelle d'un wallet externe (MetaMask)
  const fund = process.env.FUND;
  if (fund) {
    if (!ethers.isAddress(fund)) throw new Error(`FUND n'est pas une adresse : ${fund}`);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const maturity = now + 180 * 86400;

    await ethers.provider.send("hardhat_setBalance", [
      fund, "0x" + ethers.parseEther("100").toString(16),
    ]);
    await (await cash.mint(fund, ethers.parseUnits("500000", 6))).wait();
    await (await argn.mint(fund, 5000)).wait();
    await (await meta.setMaturity(fund, maturity)).wait();

    console.log(`\nWallet doté : ${fund}`);
    console.log("  100 ETH (gas) · 500 000 wMGA · 5 000 ARGN");
    console.log("  maturité de bon :", new Date(maturity * 1000).toISOString().slice(0, 10));
  }

  // 8. app/.env — le front lit ces adresses au build
  updateEnv(path.join(__dirname, "../app/.env"), {
    REACT_APP_MOCK_CASH_ADDRESS: cashAddr,
    REACT_APP_BOND_TOKEN_ADDRESS: argnAddr,
    REACT_APP_CLAIM_REGISTRY_ADDRESS: registryAddr,
    REACT_APP_BOND_METADATA_ADDRESS: metaAddr,
    REACT_APP_REPO_ESCROW_ADDRESS: escrowAddr,
    REACT_APP_REPO_RECEIPT_ADDRESS: receiptAddr,
    REACT_APP_RPC_URL: RPC_URL,
    REACT_APP_CHAIN_ID: CHAIN_ID,
    REACT_APP_HASHSCAN_URL: "",
  });
  updateEnv(path.join(__dirname, "../backend/.env"), {
    CLAIM_REGISTRY_ADDRESS: registryAddr,
    BOND_METADATA_ADDRESS: metaAddr,
    RPC_URL,
  });
  console.log("\napp/.env et backend/.env mis à jour");
}

function updateEnv(filePath, vars) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*`, "m");
    const line = `${key}=${value}`;
    if (regex.test(content)) content = content.replace(regex, line);
    else content += (content.endsWith("\n") ? "" : "\n") + line + "\n";
  }
  fs.writeFileSync(filePath, content, "utf8");
}

main().catch((err) => { console.error(err); process.exit(1); });
