/**
 * Normalise un numéro de téléphone : supprime espaces, tirets, points, parenthèses.
 * "+33 7 67 19 01 10" → "+33767190110"
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  return phone.replace(/[\s\-().]/g, '');
}

module.exports = { normalizePhone };
