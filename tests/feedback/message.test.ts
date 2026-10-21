/**
 * Feedback success copy contract.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('feedback success message', () => {
  it('API returns exact Thank you string', () => {
    const src = readFileSync(join(root, 'functions/api/feedback.ts'), 'utf8')
    assert.match(src, /Thank you for your feedback!/)
    // Must require D1 (no silent success without persist)
    assert.match(src, /QUOTA_STORE_UNAVAILABLE/)
  })

  it('Chat UI only toasts after success', () => {
    const src = readFileSync(join(root, 'src/pages/Chat.tsx'), 'utf8')
    assert.match(src, /Thank you for your feedback!/)
    assert.match(src, /if \(res\.ok && data\.success\)/)
  })
})
