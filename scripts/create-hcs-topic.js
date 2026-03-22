/**
 * Crée un topic HCS public sur Hedera testnet.
 * Usage : node scripts/create-hcs-topic.js
 * Le topic ID affiché doit être ajouté à backend/.env : HCS_TOPIC_ID=0.0.XXXXX
 */
const dotenvPath = require('path').join(__dirname, '../backend/.env');
require('../backend/node_modules/dotenv').config({ path: dotenvPath });
const {
  Client,
  TopicCreateTransaction,
  PrivateKey,
  AccountId,
  Hbar,
} = require('../backend/node_modules/@hashgraph/sdk');
const fs   = require('fs');
const path = require('path');

async function main() {
  const accountId  = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new Error('HEDERA_ACCOUNT_ID et HEDERA_PRIVATE_KEY requis dans backend/.env');
  }

  const client = Client.forTestnet();
  const key = privateKey.startsWith('0x')
    ? PrivateKey.fromStringECDSA(privateKey.slice(2))
    : PrivateKey.fromString(privateKey);
  client.setOperator(AccountId.fromString(accountId), key);

  console.log('Création du topic HCS sur Hedera testnet...');
  console.log('Opérateur :', accountId);

  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Argonath V3 — Journal notariel')
    // Pas de submitKey → topic public, tout le monde peut soumettre
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);

  const signed   = await tx.sign(key);
  const response = await signed.execute(client);
  const receipt  = await response.getReceipt(client);
  const topicId  = receipt.topicId.toString();

  console.log('\n✓ Topic créé :', topicId);
  console.log('HashScan :', `https://hashscan.io/testnet/topic/${topicId}`);
  console.log('\nAjouter dans backend/.env :');
  console.log(`HCS_TOPIC_ID=${topicId}`);

  // Mise à jour automatique de backend/.env
  const envPath = path.join(__dirname, '../backend/.env');
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('HCS_TOPIC_ID=')) {
      content = content.replace(/^HCS_TOPIC_ID=.*/m, `HCS_TOPIC_ID=${topicId}`);
    } else {
      content += (content.endsWith('\n') ? '' : '\n') + `HCS_TOPIC_ID=${topicId}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('\n✓ backend/.env mis à jour automatiquement.');
  }

  client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
