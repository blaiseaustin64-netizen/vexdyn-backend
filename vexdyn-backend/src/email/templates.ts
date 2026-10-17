/**
 * Branded VEXDYN transactional email templates.
 * Logos: real assets from the website project (public/assets/brand/).
 * Public HTTPS URLs are built from APP_BASE_URL (e.g. https://vexdyn.com/assets/brand/...).
 */

export type VerifyEmailParams = {
  displayName?: string | null
  /** High-entropy token — only used inside verifyUrl; never shown as a code. */
  token: string
  verifyUrl: string
  expiresMinutes: number
  /** Origin that hosts /assets/brand/* (no trailing slash). */
  assetBaseUrl: string
}

export type ResetPasswordParams = {
  displayName?: string | null
  resetUrl: string
  expiresMinutes: number
  assetBaseUrl: string
}

/** Matches marketing / product UI accents (purple on obsidian). */
const BRAND = {
  name: 'VEXDYN',
  tagline: "Build what's next",
  accent: '#7c6cff',
  bg: '#0A0A0D',
  card: '#12121a',
  border: '#26262e',
  text: '#F5F5F7',
  muted: '#A7A7B0',
  mutedDim: '#6e6e7a',
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function assetUrl(base: string, path: string): string {
  const root = (base || 'https://vexdyn.com').replace(/\/$/, '')
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

function shell(opts: {
  title: string
  preheader: string
  bodyHtml: string
  assetBaseUrl: string
}): string {
  const symbol = assetUrl(opts.assetBaseUrl, '/assets/brand/vexdyn-symbol.png')
  const wordmark = assetUrl(opts.assetBaseUrl, '/assets/brand/vexdyn-wordmark.png')
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(opts.title)}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};">
    ${escapeHtml(opts.preheader)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 28px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 12px 0;">
                    <img src="${escapeHtml(symbol)}" width="48" height="44" alt="VEXDYN" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:48px;">
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(wordmark)}" width="140" height="18" alt="VEXDYN" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px;">
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.accent};font-weight:700;">
                VEXDYN
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:36px 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    ${opts.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 12px 8px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:${BRAND.mutedDim};">
                <span style="color:${BRAND.muted};font-weight:600;letter-spacing:0.08em;">VEXDYN</span>
                &nbsp;&middot;&nbsp;${escapeHtml(BRAND.tagline)}
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:${BRAND.mutedDim};">
                &copy; ${year} VEXDYN. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0 0;">
      <tr>
        <td align="center" bgcolor="${BRAND.accent}" style="border-radius:12px;background-color:${BRAND.accent};">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`
}

function plainLinkBlock(url: string): string {
  return `
    <p style="margin:22px 0 0 0;font-size:12px;line-height:1.6;color:${BRAND.mutedDim};">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0 0;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${escapeHtml(url)}" style="color:${BRAND.accent};text-decoration:underline;">${escapeHtml(url)}</a>
    </p>`
}

export function verificationEmail(p: VerifyEmailParams): {
  subject: string
  html: string
  text: string
} {
  const subject = 'Verify your VEXDYN account'
  const who = p.displayName ? ` ${escapeHtml(p.displayName.trim())}` : ''
  const mins = p.expiresMinutes
  void p.token

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.accent};">
      Welcome
    </p>
    <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.text};">
      Confirm your email
    </h1>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.65;color:${BRAND.muted};">
      Hi${who}, thanks for creating a VEXDYN account. Confirm your email address to finish setup and start building.
    </p>
    ${ctaButton(p.verifyUrl, 'Verify email address')}
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.6;color:${BRAND.mutedDim};">
      This link expires in <strong style="color:${BRAND.muted};">${mins} minutes</strong>.
    </p>
    ${plainLinkBlock(p.verifyUrl)}
    <p style="margin:28px 0 0 0;padding-top:22px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.6;color:${BRAND.mutedDim};">
      If you did not create a VEXDYN account, you can ignore this email. No changes will be made.
    </p>`

  const html = shell({
    title: subject,
    preheader: `Verify your email to activate your VEXDYN account. Link expires in ${mins} minutes.`,
    bodyHtml,
    assetBaseUrl: p.assetBaseUrl,
  })

  const text = [
    'VEXDYN — Verify your account',
    '',
    `Hi${p.displayName ? ` ${p.displayName.trim()}` : ''},`,
    '',
    'Thanks for creating a VEXDYN account. Open this link to verify your email:',
    p.verifyUrl,
    '',
    `This link expires in ${mins} minutes.`,
    '',
    'If you did not create a VEXDYN account, you can ignore this email.',
    '',
    `— ${BRAND.name} · ${BRAND.tagline}`,
  ].join('\n')

  return { subject, html, text }
}

export function passwordResetEmail(p: ResetPasswordParams): {
  subject: string
  html: string
  text: string
} {
  const subject = 'Reset your VEXDYN password'
  const who = p.displayName ? ` ${escapeHtml(p.displayName.trim())}` : ''
  const mins = p.expiresMinutes

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.accent};">
      Security
    </p>
    <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.text};">
      Reset your password
    </h1>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.65;color:${BRAND.muted};">
      Hi${who}, we received a request to reset the password for your VEXDYN account. Use the button below to choose a new one.
    </p>
    ${ctaButton(p.resetUrl, 'Reset password')}
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.6;color:${BRAND.mutedDim};">
      This link expires in <strong style="color:${BRAND.muted};">${mins} minutes</strong>.
    </p>
    ${plainLinkBlock(p.resetUrl)}
    <p style="margin:28px 0 0 0;padding-top:22px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.6;color:${BRAND.mutedDim};">
      If you did not request a password reset, you can ignore this email. Your password will not change.
    </p>`

  const html = shell({
    title: subject,
    preheader: `Reset your VEXDYN password. Link expires in ${mins} minutes.`,
    bodyHtml,
    assetBaseUrl: p.assetBaseUrl,
  })

  const text = [
    'VEXDYN — Reset your password',
    '',
    `Hi${p.displayName ? ` ${p.displayName.trim()}` : ''},`,
    '',
    'We received a request to reset your VEXDYN password. Open this link to choose a new one:',
    p.resetUrl,
    '',
    `This link expires in ${mins} minutes.`,
    '',
    'If you did not request a reset, you can ignore this email. Your password will not change.',
    '',
    `— ${BRAND.name} · ${BRAND.tagline}`,
  ].join('\n')

  return { subject, html, text }
}
