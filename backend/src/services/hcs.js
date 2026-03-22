/**
 * Service HCS — Hedera Consensus Service
 * Publie des messages notariaux immuables sur un topic HCS public.
 *
 * phone_proof = keccak256(phone) — le numéro n'est jamais publié en clair.
 * Vérifiable : quiconque connaît le numéro peut recalculer le hash.
 *
 * Format message :
 * {
 *   v: 1,
 *   event: string,
 *   ts: ISO8601,
 *   wallet: "0x...",
 *   phone_proof?: "0x...",
 *   public: { ... },      // affiché à tous
 *   depositary: { ... },  // affiché uniquement dans l'UI dépositaire
 * }
 */
const { TopicMessageSubmitTransaction, TopicId, Client, PrivateKey, AccountId } = require('@hashgraph/sdk');
const { ethers } = require('ethers');

function getClient() {
  const accountId  = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!accountId || !privateKey) throw new Error('[hcs] HEDERA_ACCOUNT_ID et HEDERA_PRIVATE_KEY requis');
  const client = Client.forTestnet();
  const key = privateKey.startsWith('0x')
    ? PrivateKey.fromStringECDSA(privateKey.slice(2))
    : PrivateKey.fromString(privateKey);
  client.setOperator(AccountId.fromString(accountId), key);
  return { client, key };
}

/**
 * Preuve vérifiable d'un numéro de téléphone.
 * keccak256(phone) — jamais le numéro brut.
 * Vérifiable : quiconque connaît le numéro peut recalculer.
 */
function phoneProof(phone) {
  return ethers.keccak256(ethers.toUtf8Bytes(phone.trim()));
}

/**
 * Preuve vérifiable d'identité : keccak256(firstName + lastName + phone).
 * Permet au dépositaire de vérifier qu'une personne précise est liée à un événement
 * sans révéler son nom ou son numéro.
 */
function identityProof(firstName, lastName, phone) {
  const input = [firstName, lastName, phone].join('|').trim();
  return ethers.keccak256(ethers.toUtf8Bytes(input));
}

/**
 * Preuve vérifiable d'une allocation : keccak256(batchId).
 * Permet de relier un événement à une allocation spécifique sans exposer les détails.
 */
function claimProof(batchId) {
  return ethers.keccak256(ethers.toUtf8Bytes(batchId.trim()));
}

/**
 * Publie un événement notarial sur le topic HCS.
 * Silencieux en cas d'erreur pour ne pas bloquer les routes.
 *
 * @param {string} eventType — ex: "wallet_phone_linked"
 * @param {object} payload   — { wallet, phone_proof?, public: {}, depositary: {} }
 */
async function publishEvent(eventType, payload) {
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) {
    console.warn('[hcs] HCS_TOPIC_ID non configuré — publication ignorée');
    return;
  }

  const message = JSON.stringify({
    v: 1,
    event: eventType,
    ts: new Date().toISOString(),
    ...payload,
  });

  try {
    const { client } = getClient();
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);
    const response = await tx.execute(client);
    await response.getReceipt(client);
    client.close();
    console.log(`[hcs] ✓ ${eventType} publié`);
  } catch (err) {
    console.error(`[hcs] Erreur publication ${eventType}:`, err.message?.slice(0, 120));
  }
}

module.exports = { publishEvent, phoneProof, identityProof, claimProof };
