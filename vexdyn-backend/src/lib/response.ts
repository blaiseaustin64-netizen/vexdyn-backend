/** JSON response helpers with consistent error shape. */

export type ApiErrorBody = {
  ok: false
  error: string
  code?: string
}

export type ApiOkBody<T = Record<string, unknown>> = {
  ok: true
} & T

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { status, headers })
}

export function ok<T extends Record<string, unknown>>(data?: T, status = 200): Response {
  return json({ ok: true, ...data }, status)
}

export function err(message: string, status = 400, code?: string): Response {
  const body: ApiErrorBody = { ok: false, error: message }
  if (code) body.code = code
  return json(body, status)
}

/** Generic messages that do not reveal whether an account exists. */
export const SAFE = {
  genericAuth: 'Invalid email or password.',
  verificationSent: 'If an account exists for that email, a verification message has been sent.',
  resetSent: 'If an account exists for that email, a password reset message has been sent.',
  verified: 'Email verified successfully.',
  passwordChanged: 'Password updated successfully.',
  loggedOut: 'Signed out.',
} as const
