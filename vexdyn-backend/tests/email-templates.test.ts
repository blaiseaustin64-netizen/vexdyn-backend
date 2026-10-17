/**
 * Email template rendering tests — no network, no real sends.
 */
import { describe, it, expect } from 'vitest'
import { verificationEmail, passwordResetEmail } from '../src/email/templates'
import { DEFAULT_EMAIL_FROM } from '../src/email/brevo'

const ASSET = 'https://vexdyn.com'

describe('DEFAULT_EMAIL_FROM', () => {
  it('uses VEXDYN Support and hellovexdyn@gmail.com', () => {
    expect(DEFAULT_EMAIL_FROM).toBe('VEXDYN Support <hellovexdyn@gmail.com>')
  })
})

describe('verificationEmail', () => {
  it('shows the 6-digit code, puts it in the subject and says 5 minutes', () => {
    const m = verificationEmail({
      displayName: 'Ada',
      code: '482913',
      expiresMinutes: 5,
      assetBaseUrl: ASSET,
    })
    expect(m.subject).toBe('482913 is your VEXDYN verification code')
    expect(m.html).toContain('482913')
    expect(m.text).toContain('482913')
    expect(m.html).toContain('5 minutes')
    expect(m.text).toContain('5 minutes')
    expect(m.html).not.toContain('30 minutes')
  })

  it('has no verification link or button', () => {
    const m = verificationEmail({ code: '000123', expiresMinutes: 5, assetBaseUrl: ASSET })
    expect(m.html).not.toContain('verify-email?token')
    expect(m.html).not.toContain('Verify email address')
    expect(m.text).not.toContain('http')
  })

  it('embeds the brand symbol from the site origin and a text wordmark', () => {
    const m = verificationEmail({ code: '123456', expiresMinutes: 5, assetBaseUrl: ASSET })
    expect(m.html).toContain('https://vexdyn.com/assets/brand/vexdyn-symbol.png')
    expect(m.html).toContain('alt="VEXDYN"')
    expect(m.html).toContain('>VEXDYN</div>')
  })

  it('escapes user-controlled display names', () => {
    const m = verificationEmail({
      displayName: '<script>alert(1)</script>',
      code: '123456',
      expiresMinutes: 5,
      assetBaseUrl: ASSET,
    })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('only ever renders digits as the code', () => {
    const m = verificationEmail({ code: '12<b>3456', expiresMinutes: 5, assetBaseUrl: ASSET })
    expect(m.html).not.toContain('<b>3456')
  })

  it('includes ignore guidance', () => {
    const m = verificationEmail({ code: '123456', expiresMinutes: 5, assetBaseUrl: ASSET })
    expect(m.html.toLowerCase()).toMatch(/did not create/)
    expect(m.text.toLowerCase()).toMatch(/did not create/)
  })
})

describe('passwordResetEmail', () => {
  const resetUrl = 'https://vexdyn.com/reset-password?token=reset_token_value_here'

  it('uses required subject and 30-minute expiry from backend', () => {
    const m = passwordResetEmail({
      displayName: 'Ada',
      resetUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.subject).toBe('Reset your VEXDYN password')
    expect(m.html).toContain('Reset password')
    expect(m.html).toContain('30 minutes')
    expect(m.text).toContain(resetUrl)
    expect(m.html).toContain(resetUrl)
  })

  it('warns if user did not request reset', () => {
    const m = passwordResetEmail({
      resetUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.html.toLowerCase()).toMatch(/did not request/)
    expect(m.text.toLowerCase()).toMatch(/did not request/)
  })

  it('escapes malicious display names', () => {
    const m = passwordResetEmail({
      displayName: '"><img src=x onerror=alert(1)>',
      resetUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.html).not.toContain('onerror=')
    expect(m.html).toContain('&quot;')
  })
})
