import type { Env } from '../env'
import {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  hashPassword,
  verifyPassword,
} from '../lib/crypto'
import {
  findUserByEmail,
  findUserById,
  createUser,
  UniqueConstraintError,
  markEmailVerified,
  updatePassword,
  createSession,
  findSessionByToken,
  revokeSession,
  revokeAllUserSessions,
  createAuthToken,
  consumeAuthToken,
  createHandoffCode,
  consumeHandoffCode,
  listMemberships,
  toPublicUser,
} from '../lib/db'
import { checkRateLimit, clientIp } from '../lib/rate-limit'
import { ok, err, SAFE } from '../lib/response'
import {
  generateSessionToken,
  generateUrlToken,
  extractSessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from '../lib/session-token'
import { sendVerificationEmail, sendPasswordResetEmail } from '../email/brevo'

const VERIFY_TTL_MIN = 30
const RESET_TTL_MIN = 30
const PRODUCTS = new Set(['forge', 'brand', 'xray', 'lab', 'main'])

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** POST /auth/register */
export async function register(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'register', ip, 5, 3600)
  if (!rl.allowed) {
    return err('Too many registration attempts. Try again later.', 429, 'rate_limited')
  }

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const email = normalizeEmail(str(body.email))
  const password = str(body.password)
  const displayName = str(body.displayName).trim().slice(0, 80) || null

  if (!isValidEmail(email)) return err('Please enter a valid email address.')
  if (!isValidPassword(password)) {
    return err('Password must be 8–128 characters and include at least one letter and one number.')
  }

  const existing = await findUserByEmail(env.DB, email)
  if (existing) {
    // Uniform response — do not reveal whether the account already exists
    return ok({ message: SAFE.verificationSent }, 201)
  }

  const passwordHash = await hashPassword(password)
  let user
  try {
    user = await createUser(env.DB, email, passwordHash, displayName)
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      // Concurrent register won the race — same safe response as "already exists"
      return ok({ message: SAFE.verificationSent }, 201)
    }
    throw e
  }

  const token = generateUrlToken(32)
  try {
    await createAuthToken(env.DB, user.id, 'email_verify', token, VERIFY_TTL_MIN)
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      // Retry once with a fresh token
      const token2 = generateUrlToken(32)
      await createAuthToken(env.DB, user.id, 'email_verify', token2, VERIFY_TTL_MIN)
      const verifyUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token2)}&email=${encodeURIComponent(email)}`
      const sent = await sendVerificationEmail(
        env,
        { email, name: displayName },
        token2,
        verifyUrl,
        VERIFY_TTL_MIN
      )
      if (!sent.ok) console.error('Verification email failed for new user', user.id)
      return ok({ message: SAFE.verificationSent }, 201)
    }
    throw e
  }

  const verifyUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const sent = await sendVerificationEmail(
    env,
    { email, name: displayName },
    token,
    verifyUrl,
    VERIFY_TTL_MIN
  )
  if (!sent.ok) {
    console.error('Verification email failed for new user', user.id)
  }

  return ok({ message: SAFE.verificationSent }, 201)
}

/** POST /auth/verify-email  { email, token } */
export async function verifyEmail(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'verify', ip, 20, 3600)
  if (!rl.allowed) return err('Too many attempts. Try again later.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const email = normalizeEmail(str(body.email))
  // Accept `token` (preferred) or legacy `code` field name for one release
  const token = (str(body.token) || str(body.code)).trim()
  if (!isValidEmail(email) || token.length < 32) {
    return err('Invalid or expired verification link.')
  }

  const emailRl = await checkRateLimit(env.DB, 'verify_email', email, 10, 3600)
  if (!emailRl.allowed) return err('Too many attempts. Try again later.', 429, 'rate_limited')

  const user = await findUserByEmail(env.DB, email)
  if (!user) return err('Invalid or expired verification link.')
  if (user.email_verified === 1) {
    return err('Invalid or expired verification link.')
  }

  const consumed = await consumeAuthToken(env.DB, 'email_verify', token, user.id)
  if (!consumed || consumed.userId !== user.id) {
    return err('Invalid or expired verification link.')
  }

  await markEmailVerified(env.DB, user.id)
  const verified = await findUserById(env.DB, user.id)
  if (!verified) return err('Account not found.', 404)

  // Issue session after successful verification
  const rawToken = generateSessionToken()
  const { expiresAt } = await createSession(
    env.DB,
    verified.id,
    rawToken,
    ip,
    request.headers.get('user-agent')
  )

  const res = ok({
    message: SAFE.verified,
    user: toPublicUser(verified),
    sessionToken: rawToken,
    expiresAt,
  })
  res.headers.set('set-cookie', sessionCookieHeader(rawToken, expiresAt))
  return res
}

/** POST /auth/resend-verification  { email } */
export async function resendVerification(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'resend', ip, 5, 3600)
  if (!rl.allowed) return err('Too many attempts. Try again later.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')
  const email = normalizeEmail(str(body.email))
  if (!isValidEmail(email)) return err('Please enter a valid email address.')

  const user = await findUserByEmail(env.DB, email)
  // Always same message
  if (!user || user.email_verified === 1) {
    return ok({ message: SAFE.verificationSent })
  }

  const emailRl = await checkRateLimit(env.DB, 'resend_email', email, 3, 3600)
  if (!emailRl.allowed) return ok({ message: SAFE.verificationSent })

  const token = generateUrlToken(32)
  await createAuthToken(env.DB, user.id, 'email_verify', token, VERIFY_TTL_MIN)
  const verifyUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  await sendVerificationEmail(env, { email, name: user.display_name }, token, verifyUrl, VERIFY_TTL_MIN)

  return ok({ message: SAFE.verificationSent })
}

/** POST /auth/login  { email, password } */
export async function login(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'login', ip, 20, 900)
  if (!rl.allowed) return err('Too many login attempts. Try again later.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const email = normalizeEmail(str(body.email))
  const password = str(body.password)

  if (!isValidEmail(email) || !password) {
    return err(SAFE.genericAuth, 401, 'invalid_credentials')
  }

  const emailRl = await checkRateLimit(env.DB, 'login_email', email, 10, 900)
  if (!emailRl.allowed) return err(SAFE.genericAuth, 401, 'invalid_credentials')

  const user = await findUserByEmail(env.DB, email)
  if (!user) {
    // Dummy work to reduce timing oracle
    await hashPassword(password)
    return err(SAFE.genericAuth, 401, 'invalid_credentials')
  }

  const valid = await verifyPassword(password, user.password_hash)
  // Same error whether password is wrong or email is unverified (no account-state leak)
  if (!valid || user.email_verified !== 1) {
    return err(SAFE.genericAuth, 401, 'invalid_credentials')
  }

  const rawToken = generateSessionToken()
  const { expiresAt } = await createSession(
    env.DB,
    user.id,
    rawToken,
    ip,
    request.headers.get('user-agent')
  )

  const memberships = await listMemberships(env.DB, user.id)

  const res = ok({
    user: toPublicUser(user),
    sessionToken: rawToken,
    expiresAt,
    memberships,
  })
  res.headers.set('set-cookie', sessionCookieHeader(rawToken, expiresAt))
  return res
}

/** POST /auth/logout */
export async function logout(request: Request, env: Env): Promise<Response> {
  const token = extractSessionToken(request)
  if (token) {
    const session = await findSessionByToken(env.DB, token)
    if (session) await revokeSession(env.DB, session.id)
  }
  const res = ok({ message: SAFE.loggedOut })
  res.headers.set('set-cookie', clearSessionCookieHeader())
  return res
}

/** GET /auth/me */
export async function me(request: Request, env: Env): Promise<Response> {
  const token = extractSessionToken(request)
  if (!token) return err('Not authenticated.', 401, 'unauthenticated')

  const session = await findSessionByToken(env.DB, token)
  if (!session) return err('Not authenticated.', 401, 'unauthenticated')

  const memberships = await listMemberships(env.DB, session.user.id)
  return ok({
    user: toPublicUser(session.user),
    memberships,
    session: {
      id: session.id,
      expiresAt: session.expires_at,
    },
  })
}

/** POST /auth/forgot-password  { email } */
export async function forgotPassword(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'forgot', ip, 5, 3600)
  if (!rl.allowed) return ok({ message: SAFE.resetSent })

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')
  const email = normalizeEmail(str(body.email))
  if (!isValidEmail(email)) return ok({ message: SAFE.resetSent })

  const user = await findUserByEmail(env.DB, email)
  if (!user) return ok({ message: SAFE.resetSent })

  const emailRl = await checkRateLimit(env.DB, 'forgot_email', email, 3, 3600)
  if (!emailRl.allowed) return ok({ message: SAFE.resetSent })

  const rawToken = generateUrlToken(32)
  await createAuthToken(env.DB, user.id, 'password_reset', rawToken, RESET_TTL_MIN)

  const resetUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`
  await sendPasswordResetEmail(
    env,
    { email, name: user.display_name },
    resetUrl,
    RESET_TTL_MIN
  )

  return ok({ message: SAFE.resetSent })
}

/** POST /auth/reset-password  { token, password } */
export async function resetPassword(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'reset', ip, 10, 3600)
  if (!rl.allowed) return err('Too many attempts. Try again later.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const token = str(body.token).trim()
  const password = str(body.password)
  if (!token || token.length < 16) return err('Invalid or expired reset link.')
  if (!isValidPassword(password)) {
    return err('Password must be 8–128 characters and include at least one letter and one number.')
  }

  const consumed = await consumeAuthToken(env.DB, 'password_reset', token)
  if (!consumed) return err('Invalid or expired reset link.')

  const passwordHash = await hashPassword(password)
  await updatePassword(env.DB, consumed.userId, passwordHash)
  // Revoke all existing sessions after password change
  await revokeAllUserSessions(env.DB, consumed.userId)

  return ok({ message: SAFE.passwordChanged })
}

/** POST /auth/change-password  { currentPassword, newPassword } — requires session */
export async function changePassword(request: Request, env: Env): Promise<Response> {
  const token = extractSessionToken(request)
  if (!token) return err('Not authenticated.', 401, 'unauthenticated')

  const session = await findSessionByToken(env.DB, token)
  if (!session) return err('Not authenticated.', 401, 'unauthenticated')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const currentPassword = str(body.currentPassword)
  const newPassword = str(body.newPassword)

  if (!isValidPassword(newPassword)) {
    return err('Password must be 8–128 characters and include at least one letter and one number.')
  }

  const valid = await verifyPassword(currentPassword, session.user.password_hash)
  if (!valid) return err('Current password is incorrect.', 401, 'invalid_credentials')

  const passwordHash = await hashPassword(newPassword)
  await updatePassword(env.DB, session.user.id, passwordHash)
  await revokeAllUserSessions(env.DB, session.user.id)

  // Issue a fresh session for the current client
  const rawToken = generateSessionToken()
  const { expiresAt } = await createSession(
    env.DB,
    session.user.id,
    rawToken,
    clientIp(request),
    request.headers.get('user-agent')
  )

  const res = ok({
    message: SAFE.passwordChanged,
    sessionToken: rawToken,
    expiresAt,
  })
  res.headers.set('set-cookie', sessionCookieHeader(rawToken, expiresAt))
  return res
}

/**
 * POST /auth/handoff/create  { targetProduct }
 * Authenticated user requests a short-lived single-use code for another product domain.
 */
export async function createHandoff(request: Request, env: Env): Promise<Response> {
  const token = extractSessionToken(request)
  if (!token) return err('Not authenticated.', 401, 'unauthenticated')

  const session = await findSessionByToken(env.DB, token)
  if (!session) return err('Not authenticated.', 401, 'unauthenticated')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')
  const targetProduct = str(body.targetProduct).toLowerCase()
  if (!PRODUCTS.has(targetProduct)) return err('Invalid target product.')

  const code = generateUrlToken(16)
  const { expiresAt } = await createHandoffCode(env.DB, session.user.id, targetProduct, code)

  // Client exchanges this code via POST on the target product — never put long-lived tokens in URLs
  return ok({
    code,
    targetProduct,
    expiresAt,
    expiresInSeconds: 120,
  })
}

/**
 * POST /auth/handoff/exchange  { code, targetProduct }
 * Target product exchanges the one-time code for a new session on this backend.
 */
export async function exchangeHandoff(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'handoff', ip, 30, 900)
  if (!rl.allowed) return err('Too many attempts.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')

  const code = str(body.code).trim()
  const targetProduct = str(body.targetProduct).toLowerCase()
  if (!code || !PRODUCTS.has(targetProduct)) return err('Invalid handoff request.')

  const consumed = await consumeHandoffCode(env.DB, code, targetProduct)
  if (!consumed) return err('Invalid or expired handoff code.', 401, 'invalid_handoff')

  const user = await findUserById(env.DB, consumed.userId)
  if (!user) return err('Account not found.', 404)

  const rawToken = generateSessionToken()
  const { expiresAt } = await createSession(
    env.DB,
    user.id,
    rawToken,
    ip,
    request.headers.get('user-agent')
  )
  const memberships = await listMemberships(env.DB, user.id)

  const res = ok({
    user: toPublicUser(user),
    sessionToken: rawToken,
    expiresAt,
    memberships,
  })
  res.headers.set('set-cookie', sessionCookieHeader(rawToken, expiresAt))
  return res
}

/** POST /auth/google  { credential }  (ID token from Google Identity Services) */
export async function googleSignIn(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID) return err('Google sign-in is not set up yet.', 503, 'google_unavailable')

  const ip = clientIp(request)
  const rl = await checkRateLimit(env.DB, 'google', ip, 30, 900)
  if (!rl.allowed) return err('Too many attempts. Try again later.', 429, 'rate_limited')

  const body = await readJson(request)
  if (!body) return err('Invalid request body.')
  const credential = str(body.credential)
  if (!credential || credential.length > 4096) return err('Google sign-in failed.', 401, 'google_invalid')

  // Google checks the signature and expiry; we check audience, issuer and verified email.
  let info: Record<string, unknown> | null = null
  try {
    const r = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
    )
    if (r.ok) info = (await r.json()) as Record<string, unknown>
  } catch {
    info = null
  }
  if (!info) return err('Google sign-in failed.', 401, 'google_invalid')

  const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com'
  const expOk = Number(info.exp) * 1000 > Date.now()
  const verified = info.email_verified === 'true' || info.email_verified === true
  const email = normalizeEmail(str(info.email))
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issOk || !expOk || !verified || !isValidEmail(email)) {
    return err('Google sign-in failed.', 401, 'google_invalid')
  }

  const name = str(info.name).trim().slice(0, 80) || null
  let user = await findUserByEmail(env.DB, email)

  if (!user) {
    // New account created through Google: random password nobody knows, email already verified.
    const unusable = await hashPassword(generateUrlToken(24) + 'Aa1')
    try {
      user = await createUser(env.DB, email, unusable, name)
    } catch (e) {
      if (e instanceof UniqueConstraintError) user = await findUserByEmail(env.DB, email)
      else throw e
    }
    if (!user) return err('Google sign-in failed.', 500, 'internal')
    await markEmailVerified(env.DB, user.id)
  } else if (user.email_verified !== 1) {
    // Account was registered but never verified. Google now proves ownership of the email,
    // so replace the password: whoever pre-registered it must not keep access.
    await updatePassword(env.DB, user.id, await hashPassword(generateUrlToken(24) + 'Aa1'))
    await markEmailVerified(env.DB, user.id)
  }

  const fresh = await findUserById(env.DB, user.id)
  if (!fresh) return err('Google sign-in failed.', 500, 'internal')

  const rawToken = generateSessionToken()
  const { expiresAt } = await createSession(
    env.DB,
    fresh.id,
    rawToken,
    ip,
    request.headers.get('user-agent')
  )
  const memberships = await listMemberships(env.DB, fresh.id)

  const res = ok({
    user: toPublicUser(fresh),
    sessionToken: rawToken,
    expiresAt,
    memberships,
  })
  res.headers.set('set-cookie', sessionCookieHeader(rawToken, expiresAt))
  return res
}
