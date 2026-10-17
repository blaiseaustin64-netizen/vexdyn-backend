/**
 * Branded VEXDYN transactional email templates.
 * Black, white and silver to match the website. The header does not depend on
 * images: the VEXDYN name is real text, so it still looks right if a mail app
 * blocks pictures. Brand images come from APP_BASE_URL (/assets/brand/*).
 */

export type VerifyEmailParams = {
  displayName?: string | null
  /** 6-digit numeric code shown in the email. */
  code: string
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

const BRAND = {
  name: 'VEXDYN',
  tagline: "Build what's next",
  bg: '#0A0A0D',
  card: '#101014',
  field: '#19191F',
  border: '#26262E',
  line: '#2E2E38',
  text: '#F5F5F7',
  muted: '#A7A7B0',
  dim: '#6E6E7A',
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace"

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function assetUrl(base: string, path: string): string {
  const root = (base || 'https://vexdyn.pages.dev').replace(/\/$/, '')
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

function shell(opts: { title: string; preheader: string; bodyHtml: string; assetBaseUrl: string }): string {
  const symbol = assetUrl(opts.assetBaseUrl, '/assets/brand/vexdyn-symbol.png')
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 26px 0;">
              <img src="${escapeHtml(symbol)}" width="46" height="42" alt="VEXDYN" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:46px;color:${BRAND.text};font-family:${SANS};font-size:14px;">
              <div style="margin:14px 0 0 0;padding-left:0.5em;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:0.5em;color:${BRAND.text};">VEXDYN</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td height="3" bgcolor="#8B8B95" style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,#F5F5F7,#4A4A55);">&nbsp;</td></tr>
                <tr>
                  <td style="padding:36px 32px 32px 32px;font-family:${SANS};">
                    ${opts.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 12px 8px 12px;font-family:${SANS};">
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:${BRAND.dim};">
                <span style="color:${BRAND.muted};font-weight:600;letter-spacing:0.12em;">VEXDYN</span>&nbsp;&middot;&nbsp;${escapeHtml(BRAND.tagline)}
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:${BRAND.dim};">&copy; ${year} VEXDYN. All rights reserved.</p>
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
        <td align="center" bgcolor="#F5F5F7" style="border-radius:12px;background-color:#F5F5F7;">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:700;color:#0A0A0D;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`
}

function plainLinkBlock(url: string): string {
  return `
    <p style="margin:22px 0 0 0;font-size:12px;line-height:1.6;color:${BRAND.dim};">If the button does not work, copy and paste this link into your browser:</p>
    <p style="margin:8px 0 0 0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${BRAND.muted};text-decoration:underline;">${escapeHtml(url)}</a></p>`
}

export function verificationEmail(p: VerifyEmailParams): { subject: string; html: string; text: string } {
  const code = String(p.code).replace(/[^0-9]/g, '').slice(0, 6)
  const mins = p.expiresMinutes
  const minsWord = mins === 1 ? 'minute' : 'minutes'
  const subject = `${code} is your VEXDYN verification code`
  const who = p.displayName ? ` ${escapeHtml(p.displayName.trim())}` : ''

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.muted};">Verify your email</p>
    <h1 style="margin:0 0 14px 0;font-size:26px;line-height:1.25;font-weight:700;color:${BRAND.text};">Your verification code</h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:${BRAND.muted};">Hi${who}, enter this code on the VEXDYN sign-up page to finish creating your account.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="center" bgcolor="${BRAND.field}" style="background-color:${BRAND.field};border:1px solid ${BRAND.line};border-radius:14px;padding:24px 12px;">
          <div style="font-family:${MONO};font-size:42px;line-height:1;font-weight:700;letter-spacing:0.32em;padding-left:0.32em;color:${BRAND.text};">${escapeHtml(code)}</div>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:${BRAND.muted};text-align:center;">This code expires in <strong style="color:${BRAND.text};">${mins} ${minsWord}</strong>.</p>
    <p style="margin:26px 0 0 0;padding-top:22px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.6;color:${BRAND.dim};">
      Never share this code with anyone. VEXDYN will never ask you for it.<br>
      If you did not create a VEXDYN account, you can ignore this email. No changes will be made.
    </p>`

  const html = shell({
    title: subject,
    preheader: `Your VEXDYN code is ${code}. It expires in ${mins} ${minsWord}.`,
    bodyHtml,
    assetBaseUrl: p.assetBaseUrl,
  })

  const text = [
    'VEXDYN: your verification code',
    '',
    `Hi${p.displayName ? ` ${p.displayName.trim()}` : ''},`,
    '',
    'Enter this code on the VEXDYN sign-up page to finish creating your account:',
    '',
    `    ${code}`,
    '',
    `This code expires in ${mins} ${minsWord}.`,
    '',
    'Never share this code with anyone. VEXDYN will never ask you for it.',
    'If you did not create a VEXDYN account, you can ignore this email.',
    '',
    `${BRAND.name} · ${BRAND.tagline}`,
  ].join('\n')

  return { subject, html, text }
}

export function passwordResetEmail(p: ResetPasswordParams): { subject: string; html: string; text: string } {
  const subject = 'Reset your VEXDYN password'
  const who = p.displayName ? ` ${escapeHtml(p.displayName.trim())}` : ''
  const mins = p.expiresMinutes

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.muted};">Security</p>
    <h1 style="margin:0 0 14px 0;font-size:26px;line-height:1.25;font-weight:700;color:${BRAND.text};">Reset your password</h1>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.65;color:${BRAND.muted};">Hi${who}, we received a request to reset the password for your VEXDYN account. Use the button below to choose a new one.</p>
    ${ctaButton(p.resetUrl, 'Reset password')}
    <p style="margin:20px 0 0 0;font-size:13px;line-height:1.6;color:${BRAND.dim};">This link expires in <strong style="color:${BRAND.muted};">${mins} minutes</strong>.</p>
    ${plainLinkBlock(p.resetUrl)}
    <p style="margin:26px 0 0 0;padding-top:22px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.6;color:${BRAND.dim};">If you did not request a password reset, you can ignore this email. Your password will not change.</p>`

  const html = shell({
    title: subject,
    preheader: `Reset your VEXDYN password. Link expires in ${mins} minutes.`,
    bodyHtml,
    assetBaseUrl: p.assetBaseUrl,
  })

  const text = [
    'VEXDYN: reset your password',
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
    `${BRAND.name} · ${BRAND.tagline}`,
  ].join('\n')

  return { subject, html, text }
}
