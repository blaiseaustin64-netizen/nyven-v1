/**
 * Static audit: protected routes must fail closed and call usage helpers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('protected route wiring', () => {
  const chat = read('functions/api/chat.ts')
  const stt = read('functions/api/voice/stt.ts')
  const tts = read('functions/api/voice/tts.ts')
  const build = read('functions/api/build.ts')
  const agent = read('functions/api/agent/chat.ts')
  const feedback = read('functions/api/feedback.ts')
  const bug = read('functions/api/bug-report.ts')
  const usage = read('functions/_shared/db/usage.ts')
  const inbox = read('functions/api/agent/inbox.ts')

  it('usage module requires DB', () => {
    assert.match(usage, /export function requireDb/)
    assert.match(usage, /QUOTA_STORE_UNAVAILABLE/)
  })

  it('chat uses consumeChatMessage and provider budget', () => {
    assert.match(chat, /consumeChatMessage/)
    assert.match(chat, /consumeProviderRequest/)
    assert.match(chat, /chatQuota\.httpStatus/)
  })

  it('voice routes use consumeVoiceSeconds', () => {
    assert.match(stt, /consumeVoiceSeconds/)
    assert.match(tts, /consumeVoiceSeconds/)
    assert.match(stt, /voiceQuota\.httpStatus/)
    assert.match(tts, /voiceQuota\.httpStatus/)
  })

  it('build and agent chat are metered', () => {
    assert.match(build, /consumeChatMessage/)
    assert.match(agent, /consumeChatMessage/)
    assert.match(agent, /consumeProviderRequest/)
  })

  it('feedback and bug require D1 for success path', () => {
    assert.match(feedback, /!env\.DB/)
    assert.match(feedback, /QUOTA_STORE_UNAVAILABLE/)
    assert.match(feedback, /Thank you for your feedback!/)
    assert.match(bug, /!env\.DB/)
    assert.match(bug, /QUOTA_STORE_UNAVAILABLE/)
  })

  it('shared Gmail inbox is disabled by default', () => {
    assert.match(inbox, /ENABLE_SHARED_GMAIL_INBOX/)
    assert.match(inbox, /sharedInboxExplicitlyEnabled/)
  })
})
