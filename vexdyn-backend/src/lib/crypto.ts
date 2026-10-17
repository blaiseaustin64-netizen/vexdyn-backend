/**
 * Cryptographic helpers for VEXDYN auth.
 * Uses Web Crypto API only — fully compatible with Cloudflare Workers.
 */

const PBKDF2_ITERATIONS = 210_000
const PBKDF2_HASH = 'SHA-256'
const SALT_BYTES = 16
const KEY_BYTES = 32

/** Generate a cryptographically secure random hex string of `byteLength` bytes. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToHex(bytes)
}

/** Generate a UUID v4. */
export function uuid(): string {
  return crypto.randomUUID()
}

/** SHA-256 hex digest of a UTF-8 string. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hash))
}

/**
 * Password hash envelope: `pbkdf2$sha256$iterations$saltHex$hashHex`
 * Stored in users.password_hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`
}

/** Constant-time password verification against a stored envelope. */
export async function verifyPassword(password: string, envelope: string): Promise<boolean> {
  const parts = envelope.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return false
  }
  const iterations = parseInt(parts[2], 10)
  if (!Number.isFinite(iterations) || iterations < 10_000) return false
  const salt = hexToBytes(parts[3])
  const expected = hexToBytes(parts[4])
  if (salt.length === 0 || expected.length === 0) return false

  const actual = await deriveKey(password, salt, iterations)
  return timingSafeEqual(actual, expected)
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    baseKey,
    KEY_BYTES * 8
  )
  return new Uint8Array(bits)
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const n = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(n)) return new Uint8Array(0)
    out[i] = n
  }
  return out
}

/** Normalize email: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Basic email format check (server-side). */
export function isValidEmail(email: string): boolean {
  // Practical RFC-ish check; reject very long addresses
  if (email.length < 5 || email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/** Password policy: min 8, max 128, at least one letter and one number. */
export function isValidPassword(password: string): boolean {
  if (password.length < 8 || password.length > 128) return false
  if (!/[A-Za-z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  return true
}
