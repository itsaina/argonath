-- Argonath PoC — Schéma PostgreSQL

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  phone          VARCHAR(30)  NOT NULL,
  bond_type      VARCHAR(100) NOT NULL,
  nominal_amount DECIMAL(18,6) NOT NULL,
  rate           DECIMAL(6,4) NOT NULL,   -- ex: 0.08 = 8%
  maturity_date  DATE NOT NULL,
  batch_id       VARCHAR(100) UNIQUE NOT NULL,
  status         VARCHAR(30) DEFAULT 'available',
  -- statuts: available | published | redeemed | in_repo | repo_active | repaid | defaulted | expired | cancelled
  wallet_address VARCHAR(100),
  token_id       VARCHAR(100),            -- tokenId ERC-1155 après redeem
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- Index pour la recherche par téléphone
CREATE INDEX IF NOT EXISTS idx_claims_phone ON claims(phone);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_batch_id ON claims(batch_id);
