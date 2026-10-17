import { nowIso } from './time'
import { sha256Hex } from './crypto'

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number }

/**
 * Fixed-window rate limiter using a single atomic D1 UPSERT + RETURNING.
 *
 * One statement either:
 * - inserts count=1 (first hit),
 * - resets count=1 when the window has elapsed, or
 * - increments count otherwise.
 *
 * Allowed iff returned count <= limit. Concurrent callers serialize inside
 * SQLite’s statement execution, so they cannot all pass a separate read/check/write race.
 */
export async function checkRateLimit(
  db: D1Database,
  action: string,
  identifier: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (limit < 1 || windowSec < 1) {
    return { allowed: false, retryAfterSec: windowSec > 0 ? windowSec : 1 }
  }

  const idHash = await sha256Hex(identifier)
  const key = `${action}:${idHash}`
  const now = nowIso()

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN (strftime('%s', excluded.updated_at) - strftime('%s', rate_limits.window_start)) >= ? THEN 1
           ELSE rate_limits.count + 1
         END,
         window_start = CASE
           WHEN (strftime('%s', excluded.updated_at) - strftime('%s', rate_limits.window_start)) >= ? THEN excluded.window_start
           ELSE rate_limits.window_start
         END,
         updated_at = excluded.updated_at
       RETURNING count, window_start`
    )
    .bind(key, now, now, windowSec, windowSec)
    .first<{ count: number; window_start: string }>()

  if (!row) {
    return { allowed: false, retryAfterSec: windowSec }
  }

  if (row.count <= limit) {
    return { allowed: true }
  }

  const elapsed = Math.max(
    0,
    Math.floor(Date.now() / 1000 - new Date(row.window_start).getTime() / 1000)
  )
  return { allowed: false, retryAfterSec: Math.max(1, windowSec - elapsed) }
}

/**
 * Client IP for rate limiting. On Cloudflare Workers use only cf-connecting-ip.
 * Do not trust X-Forwarded-For (client-controllable).
 */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown'
}
