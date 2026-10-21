/**
 * Email template smoke tests — no secrets, no network.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  verificationEmail,
  feedbackNotifyEmail,
  bugNotifyEmail,
  escapeHtml,
} from '../../functions/_shared/email/templates.ts'

describe('email templates', () => {
  it('verification email includes code and expiry in text', () => {
    const m = verificationEmail({
      code: '123456',
      expiresMinutes: 15,
      purpose: 'verify_email',
    })
    assert.match(m.subject, /Verify/i)
    assert.match(m.text, /123456/)
    assert.match(m.html, /123456/)
    assert.match(m.text, /15 minutes/)
  })

  it('feedback email does not dump full conversation', () => {
    const m = feedbackNotifyEmail({
      feedbackType: 'positive',
      feedbackId: 'abc-def-ghi',
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'u1',
      reason: 'helpful',
    })
    assert.match(m.subject, /Feedback positive/)
    assert.match(m.text, /helpful/)
    assert.doesNotMatch(m.html, /full private conversation/i)
  })

  it('bug email escapes HTML in summary', () => {
    const m = bugNotifyEmail({
      reportId: 'r1',
      summary: '<script>alert(1)</script>',
      category: 'ui',
      details: 'x',
      route: '/chat',
      userId: null,
    })
    assert.doesNotMatch(m.html, /<script>alert/)
    assert.match(m.html, /&lt;script&gt;/)
  })

  it('escapeHtml encodes entities', () => {
    assert.equal(escapeHtml('a&b<"'), 'a&amp;b&lt;&quot;')
  })
})
