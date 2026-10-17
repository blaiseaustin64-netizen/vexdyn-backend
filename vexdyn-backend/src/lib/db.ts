import { uuid, sha256Hex } from './crypto'
import { nowIso, addDays, addMinutes, isExpired } from './time'

export type UserRow = {
  id: string
  email: string
  email_verified: number
  password_hash: string
  display_name: string | null
  created_at: string
  updated_at: string
  password_changed_at: string
}

export type SessionRow = {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
  last_active_at: string
  ip: string | null
  user_agent: string | null
  revoked_at: string | null
}

export type PublicUser = {
  id: string
  email: string
  emailVerified: boolean
  displayName: string | null
  createdAt: string
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.email_verified === 1,
    displayName: u.display_name,
    createdAt: u.created_at,
  }
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
}

/** Thrown when INSERT hits users_email_unique (or equivalent). */
export class UniqueConstraintError extends Error {
  constructor(message = 'unique_constraint') {
    super(message)
    this.name = 'UniqueConstraintError'
  }
}

function isUniqueConstraintFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // D1 / SQLite wording varies slightly across runtimes
  return /unique|constraint failed|SQLITE_CONSTRAINT/i.test(msg)
}

export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
  displayName?: string | null
): Promise<UserRow> {
  const id = uuid()
  const now = nowIso()
  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, email_verified, password_hash, display_name, created_at, updated_at, password_changed_at)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?)`
      )
      .bind(id, email, passwordHash, displayName ?? null, now, now, now)
      .run()
  } catch (err) {
    if (isUniqueConstraintFailure(err)) {
      throw new UniqueConstraintError()
    }
    throw err
  }
  const user = await findUserById(db, id)
  if (!user) throw new Error('Failed to create user')
  return user
}

export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?')
    .bind(nowIso(), userId)
    .run()
}

export async function updatePassword(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  const now = nowIso()
  await db
    .prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, now, userId)
    .run()
}

// ── Sessions ──────────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 30

export async function createSession(
  db: D1Database,
  userId: string,
  rawToken: string,
  ip?: string | null,
  userAgent?: string | null
): Promise<{ sessionId: string; expiresAt: string }> {
  const id = uuid()
  const tokenHash = await sha256Hex(rawToken)
  const now = nowIso()
  const expiresAt = addDays(now, SESSION_TTL_DAYS)
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_active_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, tokenHash, expiresAt, now, now, ip ?? null, userAgent ?? null)
    .run()
  return { sessionId: id, expiresAt }
}

export async function findSessionByToken(
  db: D1Database,
  rawToken: string
): Promise<(SessionRow & { user: UserRow }) | null> {
  const tokenHash = await sha256Hex(rawToken)
  const session = await db
    .prepare('SELECT * FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<SessionRow>()
  if (!session) return null
  if (session.revoked_at) return null
  if (isExpired(session.expires_at)) return null

  const user = await findUserById(db, session.user_id)
  if (!user) return null

  // Touch last_active (best-effort)
  await db
    .prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
    .bind(nowIso(), session.id)
    .run()
    .catch(() => {})

  return { ...session, user }
}

export async function revokeSession(db: D1Database, sessionId: string): Promise<void> {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(nowIso(), sessionId)
    .run()
}

export async function revokeAllUserSessions(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(nowIso(), userId)
    .run()
}

// ── Auth tokens (verify / reset) ──────────────────────────────────────────

export type TokenPurpose = 'email_verify' | 'password_reset'

export async function createAuthToken(
  db: D1Database,
  userId: string,
  purpose: TokenPurpose,
  rawToken: string,
  ttlMinutes: number
): Promise<{ expiresAt: string }> {
  // Invalidate previous unused tokens of same purpose
  await db
    .prepare(
      `UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL`
    )
    .bind(nowIso(), userId, purpose)
    .run()

  const id = uuid()
  // email_verify binds to userId; password_reset uses high-entropy token alone
  const tokenHash =
    purpose === 'email_verify'
      ? await sha256Hex(`${purpose}:${userId}:${rawToken}`)
      : await sha256Hex(`${purpose}:${rawToken}`)
  const now = nowIso()
  const expiresAt = addMinutes(now, ttlMinutes)
  try {
    await db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, purpose, tokenHash, expiresAt, now)
      .run()
  } catch (err) {
    if (isUniqueConstraintFailure(err)) {
      // Extremely unlikely with high-entropy tokens; treat as failure to issue
      throw new UniqueConstraintError('auth_token_hash_conflict')
    }
    throw err
  }
  return { expiresAt }
}

export async function consumeAuthToken(
  db: D1Database,
  purpose: TokenPurpose,
  rawToken: string,
  userId?: string
): Promise<{ userId: string } | null> {
  const tokenHash =
    purpose === 'email_verify'
      ? await sha256Hex(`${purpose}:${userId}:${rawToken}`)
      : await sha256Hex(`${purpose}:${rawToken}`)

  let row: { id: string; user_id: string; expires_at: string; used_at: string | null } | null
  if (purpose === 'email_verify') {
    if (!userId) return null
    row = await db
      .prepare(
        `SELECT id, user_id, expires_at, used_at FROM auth_tokens
         WHERE token_hash = ? AND purpose = ? AND user_id = ?`
      )
      .bind(tokenHash, purpose, userId)
      .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>()
  } else {
    row = await db
      .prepare(
        `SELECT id, user_id, expires_at, used_at FROM auth_tokens
         WHERE token_hash = ? AND purpose = ?`
      )
      .bind(tokenHash, purpose)
      .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>()
  }

  if (!row) return null
  if (row.used_at) return null
  if (isExpired(row.expires_at)) return null

  const result = await db
    .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(nowIso(), row.id)
    .run()

  // Ensure single-use under concurrent requests
  if (!result.meta.changes) return null

  return { userId: row.user_id }
}

// ── Handoff codes (cross-product) ─────────────────────────────────────────

const HANDOFF_TTL_MINUTES = 2

export async function createHandoffCode(
  db: D1Database,
  userId: string,
  targetProduct: string,
  rawCode: string
): Promise<{ expiresAt: string }> {
  const id = uuid()
  const codeHash = await sha256Hex(`${targetProduct}:${rawCode}`)
  const now = nowIso()
  const expiresAt = addMinutes(now, HANDOFF_TTL_MINUTES)
  await db
    .prepare(
      `INSERT INTO handoff_codes (id, user_id, code_hash, target_product, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, codeHash, targetProduct, expiresAt, now)
    .run()
  return { expiresAt }
}

export async function consumeHandoffCode(
  db: D1Database,
  rawCode: string,
  targetProduct: string
): Promise<{ userId: string } | null> {
  const codeHash = await sha256Hex(`${targetProduct}:${rawCode}`)
  // Recompute below after we cannot know userId — fix: hash targetProduct:rawCode only for lookup uniqueness per product, store user in row.
  const row = await db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM handoff_codes
       WHERE code_hash = ? AND target_product = ?`
    )
    .bind(codeHash, targetProduct)
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>()

  if (!row) return null
  if (row.used_at) return null
  if (isExpired(row.expires_at)) return null

  const result = await db
    .prepare('UPDATE handoff_codes SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(nowIso(), row.id)
    .run()
  if (!result.meta.changes) return null

  return { userId: row.user_id }
}

export async function listMemberships(
  db: D1Database,
  userId: string
): Promise<Array<{ product: string; role: string }>> {
  const res = await db
    .prepare('SELECT product, role FROM product_memberships WHERE user_id = ?')
    .bind(userId)
    .all<{ product: string; role: string }>()
  return res.results ?? []
}
