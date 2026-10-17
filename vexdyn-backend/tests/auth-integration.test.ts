/**
 * Integration tests (MockD1). Email network calls may fail soft without a real key.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MockD1, asD1 } from './mock-d1'
import type { Env } from '../src/env'
import * as auth from '../src/routes/auth'
import {
  findSessionByToken,
  createUser,
  createAuthToken,
} from '../src/lib/db'
import { hashPassword, sha256Hex } from '../src/lib/crypto'
import { generateUrlToken } from '../src/lib/session-token'
import { addMinutes, isExpired, nowIso } from '../src/lib/time'

function makeEnv(db: MockD1): Env {
  return {
    DB: asD1(db),
    BREVO_API_KEY: 'xkeysib-test-not-real',
    EMAIL_FROM: 'VEXDYN <hellovexdyn@gmail.com>',
    APP_BASE_URL: 'https://vexdyn.com',
    ALLOWED_ORIGINS: 'https://vexdyn.com,http://localhost:5173',
  }
}

function jsonReq(body: unknown): Request {
  return new Request('https://api.test/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '198.51.100.50',
    },
    body: JSON.stringify(body),
  })
}

async function bodyOf(res: Response) {
  return (await res.json()) as Record<string, unknown>
}

describe('auth integration', () => {
  let db: MockD1
  let env: Env

  beforeEach(() => {
    db = new MockD1()
    env = makeEnv(db)
  })

  it('registers without revealing account existence', async () => {
    const res1 = await auth.register(
      jsonReq({ email: 'alex@example.com', password: 'Password1', displayName: 'Alex' }),
      env
    )
    expect(res1.status).toBe(201)
    const b1 = await bodyOf(res1)
    expect(b1.ok).toBe(true)
    expect(b1.user).toBeUndefined()

    const res2 = await auth.register(
      jsonReq({ email: 'Alex@Example.com', password: 'Password1' }),
      env
    )
    const b2 = await bodyOf(res2)
    expect(b2.message).toBe(b1.message)
    expect(db.users).toHaveLength(1)
  })

  it('blocks login before verification with generic error', async () => {
    await auth.register(
      jsonReq({ email: 'pending@example.com', password: 'Password1' }),
      env
    )
    const res = await auth.login(
      jsonReq({ email: 'pending@example.com', password: 'Password1' }),
      env
    )
    expect(res.status).toBe(401)
    expect((await bodyOf(res)).code).toBe('invalid_credentials')
  })

  it('verifies with high-entropy token and allows login', async () => {
    const hash = await hashPassword('Password1')
    const user = await createUser(asD1(db), 'user@example.com', hash, null)
    const token = generateUrlToken(32)
    await createAuthToken(asD1(db), user.id, 'email_verify', token, 30)

    const bad = await auth.verifyEmail(
      jsonReq({ email: 'other@example.com', token }),
      env
    )
    expect(bad.status).toBe(400)

    const okRes = await auth.verifyEmail(
      jsonReq({ email: 'user@example.com', token }),
      env
    )
    expect(okRes.status).toBe(200)
    const vb = await bodyOf(okRes)
    expect(vb.sessionToken).toBeTypeOf('string')

    const loginRes = await auth.login(
      jsonReq({ email: 'user@example.com', password: 'Password1' }),
      env
    )
    expect(loginRes.status).toBe(200)
  })

  it('logout revokes session', async () => {
    const hash = await hashPassword('Password1')
    const user = await createUser(asD1(db), 'out@example.com', hash, null)
    db.users[0]!.email_verified = 1
    const loginRes = await auth.login(
      jsonReq({ email: 'out@example.com', password: 'Password1' }),
      env
    )
    const token = (await bodyOf(loginRes)).sessionToken as string
    await auth.logout(
      new Request('https://api/auth/logout', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
      env
    )
    expect(await findSessionByToken(asD1(db), token)).toBeNull()
  })

  it('password reset revokes sessions and rotates password', async () => {
    const hash = await hashPassword('Password1')
    const user = await createUser(asD1(db), 'reset@example.com', hash, null)
    db.users[0]!.email_verified = 1
    const loginRes = await auth.login(
      jsonReq({ email: 'reset@example.com', password: 'Password1' }),
      env
    )
    const oldToken = (await bodyOf(loginRes)).sessionToken as string
    const known = generateUrlToken(32)
    await createAuthToken(asD1(db), user.id, 'password_reset', known, 30)

    expect(
      (await auth.resetPassword(jsonReq({ token: known, password: 'NewPass99' }), env)).status
    ).toBe(200)
    expect(
      (
        await auth.me(
          new Request('https://api/auth/me', { headers: { authorization: `Bearer ${oldToken}` } }),
          env
        )
      ).status
    ).toBe(401)
    expect(
      (await auth.login(jsonReq({ email: 'reset@example.com', password: 'NewPass99' }), env)).status
    ).toBe(200)
  })

  it('expired session is rejected', async () => {
    const hash = await hashPassword('Password1')
    await createUser(asD1(db), 'exp@example.com', hash, null)
    db.users[0]!.email_verified = 1
    const loginRes = await auth.login(
      jsonReq({ email: 'exp@example.com', password: 'Password1' }),
      env
    )
    const token = (await bodyOf(loginRes)).sessionToken as string
    db.sessions[0]!.expires_at = addMinutes(nowIso(), -1)
    expect(isExpired(db.sessions[0]!.expires_at as string)).toBe(true)
    expect(
      (
        await auth.me(
          new Request('https://api/auth/me', { headers: { authorization: `Bearer ${token}` } }),
          env
        )
      ).status
    ).toBe(401)
  })

  it('session token is stored hashed', async () => {
    const hash = await hashPassword('Password1')
    await createUser(asD1(db), 'hash@example.com', hash, null)
    db.users[0]!.email_verified = 1
    const loginRes = await auth.login(
      jsonReq({ email: 'hash@example.com', password: 'Password1' }),
      env
    )
    const token = (await bodyOf(loginRes)).sessionToken as string
    expect(db.sessions[0]!.token_hash).toBe(await sha256Hex(token))
  })
})
