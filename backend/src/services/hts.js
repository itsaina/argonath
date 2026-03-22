/**
 * Service HTS — Hedera Token Service
 * Crée, mint et transfère le token ARGN natif HTS via le SDK Hedera.
 */
const {
  Client,
  TokenCreateTransaction,
  TokenMintTransaction,
  TransferTransaction,
  AccountId,
  TokenId,
  PrivateKey,
  TokenType,
  TokenSupplyType,
  Hbar,
} = require('@hashgraph/sdk');

function getClient() {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error('[hts] HEDERA_ACCOUNT_ID et HEDERA_PRIVATE_KEY requis');
  }
  const client = Client.forTestnet();
  const key = privateKey.startsWith('0x')
    ? PrivateKey.fromStringECDSA(privateKey.slice(2))
    : PrivateKey.fromString(privateKey);
  client.setOperator(AccountId.fromString(accountId), key);
  return { client, key };
}

/**
 * Crée le token HTS ARGN (à appeler une seule fois au déploiement).
 * @returns {string} Token ID sous forme "0.0.XXXXX"
 */
async function createArgonathToken() {
  const { client, key } = getClient();

  const tx = await new TokenCreateTransaction()
    .setTokenName('Argonath Bond')
    .setTokenSymbol('ARGN')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(AccountId.fromString(process.env.HEDERA_ACCOUNT_ID))
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(key.publicKey)
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(client);

  const signed = await tx.sign(key);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);
  const tokenId = receipt.tokenId.toString();
  console.log('[hts] Token ARGN créé :', tokenId);
  return tokenId;
}

/**
 * Convertit un token ID Hedera "0.0.N" en adresse EVM (HIP-218)
 * @param {string} tokenId - ex: "0.0.12345"
 * @returns {string} adresse EVM "0x000...3039"
 */
function tokenIdToEvmAddress(tokenId) {
  const num = parseInt(tokenId.split('.')[2], 10);
  return '0x' + num.toString(16).padStart(40, '0');
}

/**
 * Formate un Hedera transaction ID pour HashScan
 * "0.0.1234@1234567890.123456789" → "0.0.1234-1234567890-123456789"
 */
function txIdToHashScan(txId) {
  return txId.replace('@', '-').replace('.', '-').replace(/\.(\d+)$/, '-$1');
}

/**
 * Mint `amount` ARGN HTS et les transfère vers l'adresse EVM de l'investisseur.
 * @param {string} recipientEvmAddress - adresse EVM 0x...
 * @param {number} amount
 * @returns {{ mintTxId, transferTxId, hashscanMint, hashscanTransfer }}
 */
async function mintAndTransfer(recipientEvmAddress, amount) {
  const { client, key } = getClient();
  const tokenId = TokenId.fromString(process.env.HTS_TOKEN_ID);
  const senderAccountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const recipientAccountId = AccountId.fromEvmAddress(
    0, 0, recipientEvmAddress.replace('0x', '')
  );

  // 1. Mint
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount)
    .setMaxTransactionFee(new Hbar(10))
    .freezeWith(client);
  const signedMint = await mintTx.sign(key);
  const mintResponse = await signedMint.execute(client);
  const mintReceipt = await mintResponse.getReceipt(client);
  const mintTxId = mintResponse.transactionId.toString();
  console.log('[hts] Minted', amount, 'ARGN —', mintTxId, '— status:', mintReceipt.status.toString());

  // 2. Transfer
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, senderAccountId, -amount)
    .addTokenTransfer(tokenId, recipientAccountId, amount)
    .setMaxTransactionFee(new Hbar(10))
    .freezeWith(client);
  const signedTransfer = await transferTx.sign(key);
  const transferResponse = await signedTransfer.execute(client);
  const transferReceipt = await transferResponse.getReceipt(client);
  const transferTxId = transferResponse.transactionId.toString();
  console.log('[hts] Transferred', amount, 'ARGN to', recipientEvmAddress, '—', transferTxId, '— status:', transferReceipt.status.toString());

  return {
    mintTxId,
    transferTxId,
    hashscanMint:     `https://hashscan.io/testnet/transaction/${txIdToHashScan(mintTxId)}`,
    hashscanTransfer: `https://hashscan.io/testnet/transaction/${txIdToHashScan(transferTxId)}`,
  };
}

module.exports = { createArgonathToken, mintAndTransfer, tokenIdToEvmAddress };
