import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateSixDigitCode } from '../../functions/_shared/auth/tokens.ts'
import { verificationEmail } from '../../functions/_shared/email/templates.ts'

describe('email verification codes', () => {
  it('generates six digit codes', () => {
    for (let i = 0; i < 20; i++) {
      const c = generateSixDigitCode()
      assert.match(c, /^\d{6}$/)
    }
  })

  it('verification email includes code, expiry, branding, support', () => {
    const mail = verificationEmail({
      code: '123456',
      expiresMinutes: 5,
      purpose: 'verify_email',
    })
    assert.match(mail.subject, /verify/i)
    assert.match(mail.html, /123456/)
    assert.match(mail.html, /5 minutes|5\s*minutes/i)
    assert.match(mail.html, /Verify your email address/)
    assert.match(mail.html, /hellovexdyn@gmail.com/)
    assert.match(mail.html, /Do not share/i)
    assert.match(mail.text, /123456/)
  })
})
