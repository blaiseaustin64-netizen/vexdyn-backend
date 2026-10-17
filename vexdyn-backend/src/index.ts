/**
 * VEXDYN Core Auth Backend
 * Cloudflare Worker: vexdyn-backend
 * D1 binding: DB (database name: vexdyn-auth)
 *
 * API base: https://vexdyn-backend.blaisepatrick556.workers.dev
 *
 * Sessions use opaque random tokens stored as SHA-256 hashes. No shared
 * AUTH_SECRET is required for that design.
 */

import type { Env } from './env'
import { handleOptions, withCors } from './middleware/cors'
import { ok, err } from './lib/response'
import * as auth from './routes/auth'

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return handleOptions(request, env)
      }

      const response = await route(request, env)
      return withCors(response, request, env)
    } catch (e) {
      console.error('Unhandled error', e)
      return withCors(err('Internal server error.', 500, 'internal'), request, env)
    }
  },
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method.toUpperCase()

  if (method === 'GET' && (path === '/' || path === '/health' || path === '/status')) {
    return ok({
      service: 'vexdyn-backend',
      status: 'ok',
      time: new Date().toISOString(),
      auth: true,
    })
  }

  if (path === '/auth/register' && method === 'POST') return auth.register(request, env)
  if (path === '/auth/verify-email' && method === 'POST') return auth.verifyEmail(request, env)
  if (path === '/auth/resend-verification' && method === 'POST')
    return auth.resendVerification(request, env)
  if (path === '/auth/login' && method === 'POST') return auth.login(request, env)
  if (path === '/auth/logout' && method === 'POST') return auth.logout(request, env)
  if (path === '/auth/me' && method === 'GET') return auth.me(request, env)
  if (path === '/auth/forgot-password' && method === 'POST')
    return auth.forgotPassword(request, env)
  if (path === '/auth/reset-password' && method === 'POST')
    return auth.resetPassword(request, env)
  if (path === '/auth/change-password' && method === 'POST')
    return auth.changePassword(request, env)
  if (path === '/auth/handoff/create' && method === 'POST')
    return auth.createHandoff(request, env)
  if (path === '/auth/handoff/exchange' && method === 'POST')
    return auth.exchangeHandoff(request, env)

  return err('Not found.', 404, 'not_found')
}
