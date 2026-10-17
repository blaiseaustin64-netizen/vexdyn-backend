/**
 * Unit tests for token formats and crypto helpers.
 */

import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, sha256Hex } from '../src/lib/crypto'
import { generateUrlToken, generateSessionToken } from '../src/lib/session-token'
import { addMinutes, isExpired, nowIso } from '../src/lib/time'

describe('token formats', () => {
  it('url tokens are high-entropy hex', () => {
    for (let i = 0; i < 10; i++) {
      const t = generateUrlToken(32)
      expect(t).toHaveLength(64)
      expect(t).toMatch(/^[0-9a-f]+$/)
      expect(t).not.toMatch(/^\d{6}$/)
    }
  })

  it('session tokens have expected length', () => {
    expect(generateSessionToken()).toHaveLength(64)
  })
})

describe('time helpers', () => {
  it('detects expiry', () => {
    const now = nowIso()
    expect(isExpired(addMinutes(now, -5), now)).toBe(true)
    expect(isExpired(addMinutes(now, 5), now)).toBe(false)
  })
})

describe('session token hashing contract', () => {
  it('raw token is never equal to its hash', async () => {
    const raw = generateSessionToken()
    const hash = await sha256Hex(raw)
    expect(hash).not.toBe(raw)
    expect(hash).toHaveLength(64)
  })
})

describe('password change simulation', () => {
  it('old password fails after rehash', async () => {
    const oldHash = await hashPassword('OldPass12')
    expect(await verifyPassword('OldPass12', oldHash)).toBe(true)
    const newHash = await hashPassword('NewPass34')
    expect(await verifyPassword('OldPass12', newHash)).toBe(false)
    expect(await verifyPassword('NewPass34', newHash)).toBe(true)
  })
})
