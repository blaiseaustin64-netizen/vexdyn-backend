import type { Env } from '../env'

export function parseAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('origin') || ''
  const allowed = parseAllowedOrigins(env)
  const headers = new Headers()

  if (origin && allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-credentials', 'true')
    headers.set('vary', 'Origin')
  }

  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set(
    'access-control-allow-headers',
    'content-type, authorization, x-session-token'
  )
  headers.set('access-control-max-age', '86400')
  return headers
}

export function handleOptions(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const cors = corsHeaders(request, env)
  const headers = new Headers(response.headers)
  cors.forEach((v, k) => headers.set(k, v))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
