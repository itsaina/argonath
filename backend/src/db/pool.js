/**
 * Couche DB — SQLite via better-sqlite3 (zéro configuration requise).
 * Expose pool.query(sql, params) comme pg pour compatibilité avec les routes existantes.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'argonath.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id             TEXT PRIMARY KEY,
    first_name     TEXT NOT NULL,
    last_name      TEXT NOT NULL,
    phone          TEXT NOT NULL,
    bond_type      TEXT NOT NULL,
    nominal_amount REAL NOT NULL,
    rate           REAL NOT NULL,
    maturity_date  TEXT NOT NULL,
    batch_id       TEXT UNIQUE NOT NULL,
    status         TEXT DEFAULT 'available',
    wallet_address TEXT,
    token_id       TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_claims_phone    ON claims(phone);
  CREATE INDEX IF NOT EXISTS idx_claims_status   ON claims(status);
  CREATE INDEX IF NOT EXISTS idx_claims_batch_id ON claims(batch_id);

  CREATE TABLE IF NOT EXISTS repo_offers (
    id            INTEGER PRIMARY KEY,
    lender        TEXT NOT NULL,
    cash_amount   REAL NOT NULL,
    repo_rate_bps INTEGER NOT NULL,
    haircut_bps   INTEGER NOT NULL,
    duration_sec  INTEGER NOT NULL,
    contract_addr TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_offers_lender ON repo_offers(lender);

  CREATE TABLE IF NOT EXISTS repo_requests (
    id                 INTEGER PRIMARY KEY,
    borrower           TEXT NOT NULL,
    collateral_amount  REAL NOT NULL,
    desired_cash       REAL NOT NULL,
    max_rate_bps       INTEGER NOT NULL,
    duration_sec       INTEGER NOT NULL,
    bond_maturity_date TEXT,
    contract_addr      TEXT,
    created_at         TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_requests_borrower ON repo_requests(borrower);

  CREATE TABLE IF NOT EXISTS repo_proposals (
    id             TEXT PRIMARY KEY,
    request_id     INTEGER NOT NULL,
    lender_address TEXT NOT NULL,
    cash_amount    REAL NOT NULL,
    rate_bps       INTEGER NOT NULL,
    duration_sec   INTEGER NOT NULL,
    status         TEXT DEFAULT 'pending',
    created_at     TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_proposals_request ON repo_proposals(request_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_lender  ON repo_proposals(lender_address);
`);

/**
 * Émule l'interface pg : pool.query(sql, params) → { rows }
 * Convertit $1/$2/... → ? pour SQLite.
 */
function query(sql, params = []) {
  const converted = sql.replace(/\$\d+/g, '?').replace(/\bNOW\(\)/gi, "datetime('now')");
  const isSelect = /^\s*SELECT/i.test(converted);
  const hasReturning = /RETURNING \*/i.test(converted);

  if (isSelect) {
    return { rows: db.prepare(converted).all(...params) };
  }

  // INSERT / UPDATE / DELETE
  db.prepare(converted.replace(/\s+RETURNING \*/i, '')).run(...params);

  if (hasReturning) {
    // Extraire le nom de la table depuis INSERT INTO xxx ou UPDATE xxx
    const tableMatch = converted.match(/(?:INSERT\s+INTO|UPDATE)\s+(\w+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'claims';
    // L'id est toujours le premier param pour INSERT, dernier pour UPDATE
    const isInsert = /^\s*INSERT/i.test(converted);
    const id = isInsert ? params[0] : params[params.length - 1];
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    return { rows: row ? [row] : [] };
  }

  return { rows: [] };
}

module.exports = { query };
