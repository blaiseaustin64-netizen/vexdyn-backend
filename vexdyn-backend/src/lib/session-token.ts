/**
 * Session token transport.
 *
 * Prefer Authorization: Bearer <token> or X-Session-Token header.
 * Cookies are host-only on the Worker origin (no Domain=). Cross-product
 * sign-in uses handoff codes — do not rely on shared cookies across pages.dev.
 */

import { randomHex } from './crypto'

export const SESSION_HEADER = 'x-session-token'
export const SESSION_COOKIE = 'vexdyn_session'

export function generateSessionToken(): string {
  // 32 bytes = 64 hex chars
  return randomHex(32)
}

export function extractSessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim()
    if (t) return t
  }
  const header = request.headers.get(SESSION_HEADER)
  if (header?.trim()) return header.trim()

  const cookie = request.headers.get('cookie')
  if (cookie) {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
    if (match?.[1]) return decodeURIComponent(match[1])
  }
  return null
}

export function sessionCookieHeader(token: string, expiresAt: string, secure = true): string {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookieHeader(secure = true): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=None', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * High-entropy URL-safe token (hex). Used for email verification, password
 * reset, and product handoff — never a short numeric OTP.
 */
export function generateUrlToken(bytes = 32): string {
  return randomHex(bytes)
}

/** Uniform random 6-digit code (000000-999999), no modulo bias. */
export function generateVerificationCode(): string {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000
  let n = 0
  do {
    crypto.getRandomValues(buf)
    n = buf[0]!
  } while (n >= limit)
  return String(n % 1_000_000).padStart(6, '0')
}
