/**
 * Unit tests for password hashing and helpers.
 * Run with: npx vitest run tests/crypto.test.ts
 * (Requires vitest installed; pure Web Crypto — works in Node 20+.)
 */

import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  sha256Hex,
  randomHex,
} from '../src/lib/crypto'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com')
  })
})

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('user.name+tag@example.com')).toBe(true)
  })
  it('rejects invalid', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('no-at')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('enforces length and complexity', () => {
    expect(isValidPassword('short1')).toBe(false)
    expect(isValidPassword('allletters')).toBe(false)
    expect(isValidPassword('12345678')).toBe(false)
    expect(isValidPassword('Password1')).toBe(true)
  })
})

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('Password1!')
    expect(hash.startsWith('pbkdf2$sha256$')).toBe(true)
    expect(await verifyPassword('Password1!', hash)).toBe(true)
    expect(await verifyPassword('WrongPass1', hash)).toBe(false)
  })

  it('produces different salts for same password', async () => {
    const a = await hashPassword('Password1!')
    const b = await hashPassword('Password1!')
    expect(a).not.toBe(b)
  })
})

describe('sha256Hex / randomHex', () => {
  it('hashes deterministically', async () => {
    const h = await sha256Hex('vexdyn')
    expect(h).toHaveLength(64)
    expect(await sha256Hex('vexdyn')).toBe(h)
  })

  it('generates random hex', () => {
    const a = randomHex(16)
    const b = randomHex(16)
    expect(a).toHaveLength(32)
    expect(a).not.toBe(b)
  })
})
