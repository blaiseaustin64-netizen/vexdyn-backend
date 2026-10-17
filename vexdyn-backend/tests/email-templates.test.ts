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
  const verifyUrl =
    'https://vexdyn.com/verify-email?token=abc123tokenvaluewithenoughlength&email=user%40example.com'

  it('uses required subject and expiry copy', () => {
    const m = verificationEmail({
      displayName: 'Ada',
      token: 'secret-token-never-in-subject',
      verifyUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.subject).toBe('Verify your VEXDYN account')
    expect(m.html).toContain('30 minutes')
    expect(m.text).toContain('30 minutes')
    expect(m.html).toContain('Verify email address')
    expect(m.html).toContain(verifyUrl)
    expect(m.text).toContain(verifyUrl)
  })

  it('embeds real brand asset URLs from APP_BASE_URL origin', () => {
    const m = verificationEmail({
      token: 't',
      verifyUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.html).toContain('https://vexdyn.com/assets/brand/vexdyn-symbol.png')
    expect(m.html).toContain('https://vexdyn.com/assets/brand/vexdyn-wordmark.png')
    expect(m.html).toContain('alt="VEXDYN"')
  })

  it('escapes user-controlled display names', () => {
    const m = verificationEmail({
      displayName: '<script>alert(1)</script>',
      token: 't',
      verifyUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('does not place raw token outside the verify URL', () => {
    const token = 'raw_token_should_not_appear_alone_xyz'
    const url = `https://vexdyn.com/verify-email?token=${token}&email=a%40b.co`
    const m = verificationEmail({
      token,
      verifyUrl: url,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
    // Token may appear only as part of the URL
    const withoutUrls = m.html.split(url).join('')
    expect(withoutUrls).not.toContain(token)
  })

  it('includes ignore guidance', () => {
    const m = verificationEmail({
      token: 't',
      verifyUrl,
      expiresMinutes: 30,
      assetBaseUrl: ASSET,
    })
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
