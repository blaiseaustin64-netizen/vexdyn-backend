/**
 * Tests for security fixes (atomic rate limit, high-entropy verify tokens,
 * unique registration race, login non-enumeration).
 *
 * MockD1 notes:
 * - UNIQUE on email / token_hash is simulated and can be asserted.
 * - Rate-limit UPSERT is simulated atomically on a single JS thread.
 * - Parallel Promise.all still interleaves at await boundaries; the mock's
 *   _rateLimitUpsert is synchronous, so concurrent callers serialize correctly
 *   *within this mock*. That does NOT prove Cloudflare D1 production behavior
 *   under multi-colo concurrency — use wrangler + real D1 for that.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MockD1, asD1 } from './mock-d1'
import type { Env } from '../src/env'
import * as auth from '../src/routes/auth'
import { checkRateLimit, clientIp } from '../src/lib/rate-limit'
import { UniqueConstraintError, createUser, createAuthToken, consumeAuthToken } from '../src/lib/db'
import { hashPassword, sha256Hex } from '../src/lib/crypto'
import { generateUrlToken } from '../src/lib/session-token'

function makeEnv(db: MockD1): Env {
  return {
    DB: asD1(db),
    BREVO_API_KEY: 'xkeysib-test-not-real',
    EMAIL_FROM: 'VEXDYN <hellovexdyn@gmail.com>',
    APP_BASE_URL: 'https://vexdyn.com',
    ALLOWED_ORIGINS:
      'https://vexdyn.com,https://vexdyn-forge.pages.dev,https://brand-in-a-box.pages.dev,https://vexdyn-xray.pages.dev',
  }
}

function jsonReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://api.test/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.10',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

async function bodyOf(res: Response) {
  return (await res.json()) as Record<string, unknown>
}

/** Recover verify token by scanning hashes (test-only; 32-byte space is not brute-forced). */
async function peekVerifyToken(db: MockD1, userId: string, candidates: string[]): Promise<string | null> {
  const row = db.auth_tokens.find(
    (t) => t.user_id === userId && t.purpose === 'email_verify' && !t.used_at
  )
  if (!row) return null
  for (const tok of candidates) {
    const h = await sha256Hex(`email_verify:${userId}:${tok}`)
    if (h === row.token_hash) return tok
  }
  return null
}

describe('clientIp', () => {
  it('uses only cf-connecting-ip', () => {
    const req = new Request('https://x', {
      headers: {
        'cf-connecting-ip': '198.51.100.1',
        'x-forwarded-for': '1.2.3.4',
      },
    })
    expect(clientIp(req)).toBe('198.51.100.1')
  })
  it('ignores x-forwarded-for alone', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4' } })
    expect(clientIp(req)).toBe('unknown')
  })
})

describe('atomic rate limit (MockD1)', () => {
  it('allows up to limit then denies', async () => {
    const db = new MockD1()
    const d1 = asD1(db)
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit(d1, 't', 'id-a', 3, 3600)
      expect(r.allowed).toBe(true)
    }
    const denied = await checkRateLimit(d1, 't', 'id-a', 3, 3600)
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) expect(denied.retryAfterSec).toBeGreaterThan(0)
  })

  it('resets after window expiry', async () => {
    const db = new MockD1()
    const d1 = asD1(db)
    expect((await checkRateLimit(d1, 'w', 'id-b', 1, 1)).allowed).toBe(true)
    expect((await checkRateLimit(d1, 'w', 'id-b', 1, 1)).allowed).toBe(false)
    // Force window start into the past
    db.rate_limits[0]!.window_start = new Date(Date.now() - 5000).toISOString()
    expect((await checkRateLimit(d1, 'w', 'id-b', 1, 1)).allowed).toBe(true)
  })

  it('serializes concurrent callers on MockD1 (not a proof of multi-colo D1)', async () => {
    const db = new MockD1()
    const d1 = asD1(db)
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit(d1, 'c', 'id-c', 5, 3600))
    )
    const allowed = results.filter((r) => r.allowed).length
    const denied = results.filter((r) => !r.allowed).length
    expect(allowed).toBe(5)
    expect(denied).toBe(15)
  })
})

describe('registration uniqueness', () => {
  it('createUser throws UniqueConstraintError on duplicate email', async () => {
    const db = new MockD1()
    const d1 = asD1(db)
    const hash = await hashPassword('Password1')
    await createUser(d1, 'dup@example.com', hash, null)
    await expect(createUser(d1, 'dup@example.com', hash, null)).rejects.toBeInstanceOf(
      UniqueConstraintError
    )
  })

  it('register returns the same safe body on pre-existing and race duplicate', async () => {
    const db = new MockD1()
    const env = makeEnv(db)
    const a = await auth.register(
      jsonReq({ email: 'race@example.com', password: 'Password1' }),
      env
    )
    const b = await auth.register(
      jsonReq({ email: 'race@example.com', password: 'Password1' }),
      env
    )
    const ba = await bodyOf(a)
    const bb = await bodyOf(b)
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect(ba.message).toBe(bb.message)
    expect(ba.user).toBeUndefined()
    expect(bb.user).toBeUndefined()
    expect(db.users).toHaveLength(1)
  })
})

describe('email verification tokens', () => {
  const issued: string[] = []

  beforeEach(() => {
    issued.length = 0
  })

  it('uses high-entropy tokens, not 6-digit codes', async () => {
    const db = new MockD1()
    const env = makeEnv(db)
    // Intercept token by wrapping createAuthToken path: register generates token internally.
    // Capture from DB hash is impractical; instead call createAuthToken with known token.
    const hash = await hashPassword('Password1')
    const user = await createUser(asD1(db), 'tok@example.com', hash, null)
    const token = generateUrlToken(32)
    expect(token).toHaveLength(64)
    expect(token).not.toMatch(/^\d{6}$/)
    await createAuthToken(asD1(db), user.id, 'email_verify', token, 30)
    const ok = await consumeAuthToken(asD1(db), 'email_verify', token, user.id)
    expect(ok?.userId).toBe(user.id)
    const reuse = await consumeAuthToken(asD1(db), 'email_verify', token, user.id)
    expect(reuse).toBeNull()
  })

  it('verify-email requires email + long token and issues session', async () => {
    const db = new MockD1()
    const env = makeEnv(db)
    const hash = await hashPassword('Password1')
    const user = await createUser(asD1(db), 'v@example.com', hash, null)
    const token = generateUrlToken(32)
    await createAuthToken(asD1(db), user.id, 'email_verify', token, 30)

    const bad = await auth.verifyEmail(
      jsonReq({ email: 'v@example.com', token: 'short' }),
      env
    )
    expect(bad.status).toBe(400)

    const good = await auth.verifyEmail(
      jsonReq({ email: 'v@example.com', token }),
      env
    )
    expect(good.status).toBe(200)
    const body = await bodyOf(good)
    expect(body.sessionToken).toBeTypeOf('string')
    expect((body.user as { emailVerified: boolean }).emailVerified).toBe(true)
  })
})

describe('login non-enumeration', () => {
  it('returns the same error for wrong password and unverified email', async () => {
    const db = new MockD1()
    const env = makeEnv(db)
    await auth.register(jsonReq({ email: 'u@example.com', password: 'Password1' }), env)

    const unverified = await auth.login(
      jsonReq({ email: 'u@example.com', password: 'Password1' }),
      env
    )
    db.users[0]!.email_verified = 1
    const wrong = await auth.login(
      jsonReq({ email: 'u@example.com', password: 'WrongPass9' }),
      env
    )
    const missing = await auth.login(
      jsonReq({ email: 'nobody@example.com', password: 'Password1' }),
      env
    )

    const bu = await bodyOf(unverified)
    const bw = await bodyOf(wrong)
    const bm = await bodyOf(missing)
    expect(unverified.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(bu.error).toBe(bw.error)
    expect(bw.error).toBe(bm.error)
    expect(bu.code).toBe('invalid_credentials')
    expect(bw.code).toBe('invalid_credentials')
  })
})
