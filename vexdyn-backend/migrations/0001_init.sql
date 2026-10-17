-- VEXDYN Auth schema v1
-- D1 (SQLite). Applied via: wrangler d1 migrations apply vexdyn-auth --remote
-- Safe to re-run only if tables do not already exist (IF NOT EXISTS).

-- Users (one shared VEXDYN identity)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY NOT NULL,          -- uuid
  email           TEXT NOT NULL COLLATE NOCASE,       -- normalized lowercase
  email_verified  INTEGER NOT NULL DEFAULT 0,         -- 0/1
  password_hash   TEXT NOT NULL,                      -- PBKDF2 envelope
  display_name    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  password_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

-- Opaque sessions (token stored hashed; client holds raw token)
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY NOT NULL,          -- uuid
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,                      -- SHA-256 of session token
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip              TEXT,
  user_agent      TEXT,
  revoked_at      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Email verification & password-reset tokens (single-use, expiring)
-- purpose: 'email_verify' | 'password_reset'
CREATE TABLE IF NOT EXISTS auth_tokens (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL,
  token_hash      TEXT NOT NULL,                      -- SHA-256 of raw token/code
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  used_at         TEXT,
  metadata        TEXT                                -- optional JSON
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_hash_unique ON auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);

-- Product memberships (Forge, Brand-in-a-Box, X-Ray, Lab)
CREATE TABLE IF NOT EXISTS product_memberships (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product         TEXT NOT NULL,                      -- forge | brand | xray | lab
  role            TEXT NOT NULL DEFAULT 'member',     -- owner | admin | member
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, product)
);

CREATE INDEX IF NOT EXISTS product_memberships_user_idx ON product_memberships (user_id);

-- Cross-product handoff codes (short-lived, single-use; never put long-lived tokens in URLs)
CREATE TABLE IF NOT EXISTS handoff_codes (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash       TEXT NOT NULL,
  target_product  TEXT NOT NULL,                      -- forge | brand | xray | lab | main
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  used_at         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS handoff_codes_hash_unique ON handoff_codes (code_hash);
CREATE INDEX IF NOT EXISTS handoff_codes_expires_idx ON handoff_codes (expires_at);

-- Rate limiting (keyed by action + identifier hash)
CREATE TABLE IF NOT EXISTS rate_limits (
  key             TEXT PRIMARY KEY NOT NULL,
  count           INTEGER NOT NULL DEFAULT 0,
  window_start    TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
