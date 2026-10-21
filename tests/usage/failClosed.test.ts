/**
 * Fail-closed behavior when D1 is missing.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  requireDb,
  consumeChatMessage,
  consumeVoiceSeconds,
  checkBurst,
  consumeProviderRequest,
} from '../../functions/_shared/db/usage.ts'
import { GUEST_LIMITS, USER_LIMITS } from '../../functions/_shared/limits.ts'

describe('fail closed without D1', () => {
  it('requireDb rejects undefined', () => {
    const r = requireDb(undefined)
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.code, 'QUOTA_STORE_UNAVAILABLE')
      assert.equal(r.httpStatus, 503)
    }
  })

  it('consumeChatMessage denies without DB', async () => {
    const r = await consumeChatMessage(undefined, 'guest', 'g1', false)
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.code, 'QUOTA_STORE_UNAVAILABLE')
      assert.equal(r.httpStatus, 503)
    }
  })

  it('consumeVoiceSeconds denies without DB', async () => {
    const r = await consumeVoiceSeconds(undefined, 'user', 'u1', true, 10)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.httpStatus, 503)
  })

  it('checkBurst denies without DB', async () => {
    const r = await checkBurst(undefined, 'test:key')
    assert.equal(r.ok, false)
  })

  it('consumeProviderRequest denies without DB', async () => {
    const r = await consumeProviderRequest(undefined, 'gemini', {})
    assert.equal(r.ok, false)
  })
})

describe('limit constants match product policy', () => {
  it('guest 5 chat / 60s voice / 300s session', () => {
    assert.equal(GUEST_LIMITS.chatPerDay, 5)
    assert.equal(GUEST_LIMITS.voiceSecondsPerDay, 60)
    assert.equal(GUEST_LIMITS.maxVoiceSessionSeconds, 300)
  })
  it('user 100 chat / 900s voice / 300s session', () => {
    assert.equal(USER_LIMITS.chatPerDay, 100)
    assert.equal(USER_LIMITS.voiceSecondsPerDay, 900)
    assert.equal(USER_LIMITS.maxVoiceSessionSeconds, 300)
  })
})
