/** ISO-8601 UTC helpers for D1 TEXT timestamps. */

export function nowIso(): string {
  return new Date().toISOString()
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export function addMinutes(iso: string, minutes: number): string {
  return addSeconds(iso, minutes * 60)
}

export function addHours(iso: string, hours: number): string {
  return addSeconds(iso, hours * 3600)
}

export function addDays(iso: string, days: number): string {
  return addSeconds(iso, days * 86400)
}

export function isExpired(expiresAt: string, now: string = nowIso()): boolean {
  return new Date(expiresAt).getTime() <= new Date(now).getTime()
}
