/**
 * Déploie BondMetadata puis RepoEscrow (qui référence BondMetadata).
 * Usage: HEDERA_PRIVATE_KEY=0x... HEDERA_ACCOUNT_ID=0.0.XXXX \
 *        npx hardhat run scripts/deploy-escrow.js --network hedera_testnet
 */
const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const isHedera  = network.name === 'hedera_testnet';
const GAS_PRICE = isHedera ? ethers.parseUnits("1200", "gwei") : undefined;
const TX_OPTS   = isHedera ? { gasLimit: 6_000_000, gasPrice: GAS_PRICE } : {};

function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const [k, ...v] = line.split('=');
    if (k) vars[k.trim()] = v.join('=').trim();
  }
  return vars;
}

function updateEnv(filePath, vars) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*`, "m");
    const line  = `${key}=${value}`;
    if (regex.test(content)) content = content.replace(regex, line);
    else content += (content.endsWith("\n") ? "" : "\n") + line + "\n";
  }
  fs.writeFileSync(filePath, content, "utf8");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Network  :", network.name);
  console.log("Deployer :", deployer.address);

  const appEnvPath     = path.join(__dirname, "../app/.env");
  const backendEnvPath = path.join(__dirname, "../backend/.env");
  const env = readEnv(appEnvPath);

  const mockCashAddr = env.REACT_APP_MOCK_CASH_ADDRESS;
  const htsEvmAddr   = env.REACT_APP_BOND_TOKEN_ADDRESS;

  if (!mockCashAddr || !htsEvmAddr) {
    throw new Error("REACT_APP_MOCK_CASH_ADDRESS ou REACT_APP_BOND_TOKEN_ADDRESS manquant dans app/.env");
  }

  console.log("MockCash (existant) :", mockCashAddr);
  console.log("HTS ARGN  (existant):", htsEvmAddr);

  // 1. Déploiement BondMetadata
  console.log("\n1. Déploiement BondMetadata...");
  const BondMetadata = await ethers.getContractFactory("BondMetadata");
  const bondMetadata = await BondMetadata.deploy(TX_OPTS);
  await bondMetadata.waitForDeployment();
  const bondMetadataAddr = await bondMetadata.getAddress();
  console.log("   BondMetadata :", bondMetadataAddr);

  // 2. Déploiement RepoEscrow (référence BondMetadata)
  console.log("\n2. Déploiement RepoEscrow...");
  const RepoEscrow = await ethers.getContractFactory("RepoEscrow");
  const repoEscrow = await RepoEscrow.deploy(htsEvmAddr, mockCashAddr, bondMetadataAddr, TX_OPTS);
  await repoEscrow.waitForDeployment();
  const repoEscrowAddr = await repoEscrow.getAddress();
  console.log("   RepoEscrow :", repoEscrowAddr);

  // 3. Transférer ownership de BondMetadata au backend (deployer conserve l'ownership ici)
  //    Le backend utilise la clé privée du deployer → pas de transfert nécessaire.

  // 4. Hedera : associer RepoEscrow au token ARGN
  if (isHedera) {
    console.log("\n3. Association RepoEscrow <-> ARGN (HTS)...");
    try {
      const assocTx = await repoEscrow.associateWithBondToken(TX_OPTS);
      await assocTx.wait();
      console.log("   ✓ Association réussie");
    } catch (e) {
      console.warn("   ⚠ Association échouée :", e.message?.slice(0, 80));
    }
  }

  // 5. Mise à jour des .env
  updateEnv(appEnvPath, {
    REACT_APP_REPO_ESCROW_ADDRESS:  repoEscrowAddr,
    REACT_APP_BOND_METADATA_ADDRESS: bondMetadataAddr,
  });
  updateEnv(backendEnvPath, {
    BOND_METADATA_ADDRESS: bondMetadataAddr,
  });

  console.log("\n✓ app/.env et backend/.env mis à jour");
  console.log("  REACT_APP_REPO_ESCROW_ADDRESS  =", repoEscrowAddr);
  console.log("  REACT_APP_BOND_METADATA_ADDRESS =", bondMetadataAddr);
  if (isHedera) {
    console.log("\nHashScan:");
    console.log("  BondMetadata :", `https://hashscan.io/testnet/contract/${bondMetadataAddr}`);
    console.log("  RepoEscrow   :", `https://hashscan.io/testnet/contract/${repoEscrowAddr}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
