import type { Env } from '../env'
import { verificationEmail, passwordResetEmail } from './templates'

/** Brevo transactional HTTPS API (not SMTP). */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

type SendResult = { ok: true; messageId?: string } | { ok: false; error: string }

/** Default display name + address (must be authorized in Brevo). */
export const DEFAULT_EMAIL_FROM = 'VEXDYN Support <hellovexdyn@gmail.com>'

/**
 * Send transactional email via Brevo HTTPS API.
 * Requires BREVO_API_KEY (REST `api-key` header).
 * Do NOT use BREVO_SMTP_KEY here — SMTP credentials are not API keys.
 */
export async function sendBrevoEmail(
  env: Env,
  to: { email: string; name?: string | null },
  content: { subject: string; html: string; text: string }
): Promise<SendResult> {
  if (!env.BREVO_API_KEY) {
    return { ok: false, error: 'BREVO_API_KEY is not configured' }
  }

  const from = parseFrom(env.EMAIL_FROM || DEFAULT_EMAIL_FROM)

  const body = {
    sender: from,
    to: [{ email: to.email, name: to.name || undefined }],
    subject: content.subject,
    htmlContent: content.html,
    textContent: content.text,
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('Brevo send failed', res.status, text.slice(0, 200))
      return { ok: false, error: 'Email delivery failed' }
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string }
    return { ok: true, messageId: data.messageId }
  } catch (e) {
    console.error('Brevo network error', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: 'Email delivery failed' }
  }
}

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.+?)\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1]!.trim(), email: m[2]!.trim() }
  return { name: 'VEXDYN Support', email: from.trim() }
}

function assetBase(env: Env): string {
  return (env.APP_BASE_URL || 'https://vexdyn.pages.dev').replace(/\/$/, '')
}

export async function sendVerificationEmail(
  env: Env,
  to: { email: string; name?: string | null },
  code: string,
  expiresMinutes: number
): Promise<SendResult> {
  const content = verificationEmail({
    displayName: to.name,
    code,
    expiresMinutes,
    assetBaseUrl: assetBase(env),
  })
  return sendBrevoEmail(env, to, content)
}

export async function sendPasswordResetEmail(
  env: Env,
  to: { email: string; name?: string | null },
  resetUrl: string,
  expiresMinutes: number
): Promise<SendResult> {
  const content = passwordResetEmail({
    displayName: to.name,
    resetUrl,
    expiresMinutes,
    assetBaseUrl: assetBase(env),
  })
  return sendBrevoEmail(env, to, content)
}
