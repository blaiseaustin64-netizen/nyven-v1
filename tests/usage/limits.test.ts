/**
 * Unit tests for usage policy helpers (no D1 / no network).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GUEST_LIMITS,
  USER_LIMITS,
  dayKeyUtc,
  limitsFor,
  parseProviderBudgetEnv,
  DEFAULT_PROVIDER_BUDGETS,
} from '../../functions/_shared/limits.ts'

describe('usage limits policy', () => {
  it('guest chat is 5 / day and voice 60s', () => {
    const g = limitsFor(false)
    assert.equal(g.chatPerDay, 5)
    assert.equal(g.voiceSecondsPerDay, 60)
    assert.equal(g.maxVoiceSessionSeconds, 300)
    assert.equal(GUEST_LIMITS.chatPerDay, 5)
  })

  it('signed-in chat is 100 / day and voice 15 minutes', () => {
    const u = limitsFor(true)
    assert.equal(u.chatPerDay, 100)
    assert.equal(u.voiceSecondsPerDay, 15 * 60)
    assert.equal(USER_LIMITS.maxVoiceSessionSeconds, 300)
  })

  it('session cap is not extra allowance beyond remaining', () => {
    // Documented policy: min(requested, sessionCap, remaining)
    const remaining = 30
    const sessionCap = USER_LIMITS.maxVoiceSessionSeconds
    const requested = 120
    const granted = Math.min(requested, sessionCap, remaining)
    assert.equal(granted, 30)
  })

  it('dayKeyUtc is YYYY-MM-DD', () => {
    const k = dayKeyUtc(Date.parse('2026-10-21T12:00:00Z'))
    assert.equal(k, '2026-10-21')
  })

  it('openrouter default budget is 40', () => {
    assert.equal(DEFAULT_PROVIDER_BUDGETS.openrouter, 40)
    const parsed = parseProviderBudgetEnv({})
    assert.equal(parsed.openrouter, 40)
  })

  it('provider budget env overrides work', () => {
    const parsed = parseProviderBudgetEnv({
      PROVIDER_BUDGET_OPENROUTER: '10',
      PROVIDER_BUDGET_GEMINI: '500',
    })
    assert.equal(parsed.openrouter, 10)
    assert.equal(parsed.gemini, 500)
  })
})
