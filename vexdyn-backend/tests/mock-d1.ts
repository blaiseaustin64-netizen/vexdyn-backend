/**
 * Minimal in-memory D1 mock for unit/integration tests.
 * Supports the subset of SQL used by src/lib/db.ts and rate-limit.ts.
 */

type Row = Record<string, unknown>

function nowIso() {
  return new Date().toISOString()
}

export class MockD1 {
  users: Row[] = []
  sessions: Row[] = []
  auth_tokens: Row[] = []
  product_memberships: Row[] = []
  handoff_codes: Row[] = []
  rate_limits: Row[] = []

  prepare(sql: string) {
    const self = this
    const bound: unknown[] = []
    const stmt = {
      bind(...args: unknown[]) {
        bound.push(...args)
        return stmt
      },
      async first<T>(): Promise<T | null> {
        const n = normalize(sql)
        if (n.includes('insert into rate_limits') && n.includes('returning')) {
          return self._rateLimitUpsert(bound) as T
        }
        return self._first(sql, bound) as T | null
      },
      async run(): Promise<{ meta: { changes: number } }> {
        return self._run(sql, bound)
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: self._all(sql, bound) as T[] }
      },
    }
    return stmt
  }

  /** Atomic fixed-window counter (mirrors production SQL intent; single-threaded). */
  private _rateLimitUpsert(b: unknown[]): { count: number; window_start: string } {
    const key = b[0] as string
    const now = b[1] as string
    const windowSec = Number(b[3])
    let row = this.rate_limits.find((x) => x.key === key)
    if (!row) {
      row = { key, count: 1, window_start: now, updated_at: now }
      this.rate_limits.push(row)
      return { count: 1, window_start: now }
    }
    const startMs = new Date(row.window_start as string).getTime()
    const nowMs = new Date(now).getTime()
    const elapsedSec = Math.floor((nowMs - startMs) / 1000)
    if (elapsedSec >= windowSec) {
      row.count = 1
      row.window_start = now
      row.updated_at = now
      return { count: 1, window_start: now }
    }
    row.count = (row.count as number) + 1
    row.updated_at = now
    return { count: row.count as number, window_start: row.window_start as string }
  }

  private _first(sql: string, b: unknown[]): Row | null {
    const s = normalize(sql)
    if (s.includes('from users where email')) {
      return this.users.find((u) => u.email === b[0]) ?? null
    }
    if (s.includes('from users where id')) {
      return this.users.find((u) => u.id === b[0]) ?? null
    }
    if (s.includes('from sessions where token_hash')) {
      return this.sessions.find((x) => x.token_hash === b[0]) ?? null
    }
    if (s.includes('from auth_tokens') && s.includes('token_hash') && s.includes('purpose')) {
      if (s.includes('user_id')) {
        return (
          this.auth_tokens.find(
            (x) => x.token_hash === b[0] && x.purpose === b[1] && x.user_id === b[2]
          ) ?? null
        )
      }
      return (
        this.auth_tokens.find((x) => x.token_hash === b[0] && x.purpose === b[1]) ?? null
      )
    }
    if (s.includes('from handoff_codes') && s.includes('code_hash')) {
      return (
        this.handoff_codes.find(
          (x) => x.code_hash === b[0] && x.target_product === b[1]
        ) ?? null
      )
    }
    if (s.includes('from rate_limits where key')) {
      return this.rate_limits.find((x) => x.key === b[0]) ?? null
    }
    return null
  }

  private _all(sql: string, b: unknown[]): Row[] {
    const s = normalize(sql)
    if (s.includes('from product_memberships where user_id')) {
      return this.product_memberships.filter((x) => x.user_id === b[0])
    }
    return []
  }

  private _run(sql: string, b: unknown[]): { meta: { changes: number } } {
    const s = normalize(sql)

    if (s.startsWith('insert into users')) {
      if (this.users.some((u) => u.email === b[1])) {
        throw new Error('UNIQUE constraint failed: users.email')
      }
      this.users.push({
        id: b[0],
        email: b[1],
        email_verified: 0,
        password_hash: b[2],
        display_name: b[3],
        created_at: b[4],
        updated_at: b[5],
        password_changed_at: b[6],
      })
      return { meta: { changes: 1 } }
    }

    if (s.startsWith('update users set email_verified')) {
      const u = this.users.find((x) => x.id === b[1])
      if (u) {
        u.email_verified = 1
        u.updated_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('update users set password_hash')) {
      const u = this.users.find((x) => x.id === b[3])
      if (u) {
        u.password_hash = b[0]
        u.password_changed_at = b[1]
        u.updated_at = b[2]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('insert into sessions')) {
      this.sessions.push({
        id: b[0],
        user_id: b[1],
        token_hash: b[2],
        expires_at: b[3],
        created_at: b[4],
        last_active_at: b[5],
        ip: b[6],
        user_agent: b[7],
        revoked_at: null,
      })
      return { meta: { changes: 1 } }
    }

    if (s.startsWith('update sessions set last_active_at')) {
      const sess = this.sessions.find((x) => x.id === b[1])
      if (sess) {
        sess.last_active_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('update sessions set revoked_at') && s.includes('where id')) {
      const sess = this.sessions.find((x) => x.id === b[1] && !x.revoked_at)
      if (sess) {
        sess.revoked_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('update sessions set revoked_at') && s.includes('where user_id')) {
      let n = 0
      for (const sess of this.sessions) {
        if (sess.user_id === b[1] && !sess.revoked_at) {
          sess.revoked_at = b[0]
          n++
        }
      }
      return { meta: { changes: n } }
    }

    if (s.startsWith('update auth_tokens set used_at') && s.includes('purpose')) {
      let n = 0
      for (const t of this.auth_tokens) {
        if (t.user_id === b[1] && t.purpose === b[2] && !t.used_at) {
          t.used_at = b[0]
          n++
        }
      }
      return { meta: { changes: n } }
    }

    if (s.startsWith('insert into auth_tokens')) {
      if (this.auth_tokens.some((x) => x.token_hash === b[3])) {
        throw new Error('UNIQUE constraint failed: auth_tokens.token_hash')
      }
      this.auth_tokens.push({
        id: b[0],
        user_id: b[1],
        purpose: b[2],
        token_hash: b[3],
        expires_at: b[4],
        created_at: b[5],
        used_at: null,
        metadata: null,
      })
      return { meta: { changes: 1 } }
    }

    if (s.startsWith('update auth_tokens set used_at') && s.includes('where id')) {
      const t = this.auth_tokens.find((x) => x.id === b[1] && !x.used_at)
      if (t) {
        t.used_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('insert into handoff_codes')) {
      this.handoff_codes.push({
        id: b[0],
        user_id: b[1],
        code_hash: b[2],
        target_product: b[3],
        expires_at: b[4],
        created_at: b[5],
        used_at: null,
      })
      return { meta: { changes: 1 } }
    }

    if (s.startsWith('update handoff_codes set used_at')) {
      const t = this.handoff_codes.find((x) => x.id === b[1] && !x.used_at)
      if (t) {
        t.used_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (s.startsWith('insert into rate_limits')) {
      const key = b[0] as string
      const existing = this.rate_limits.find((x) => x.key === key)
      if (existing) {
        existing.count = 1
        existing.window_start = b[1]
        existing.updated_at = b[2]
      } else {
        this.rate_limits.push({
          key,
          count: 1,
          window_start: b[1],
          updated_at: b[2],
        })
      }
      return { meta: { changes: 1 } }
    }

    if (s.startsWith('update rate_limits set count')) {
      const row = this.rate_limits.find((x) => x.key === b[1])
      if (row) {
        row.count = (row.count as number) + 1
        row.updated_at = b[0]
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    console.warn('MockD1 unhandled SQL:', sql, b)
    return { meta: { changes: 0 } }
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function asD1(mock: MockD1): D1Database {
  return mock as unknown as D1Database
}
