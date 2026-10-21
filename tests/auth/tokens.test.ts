import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomToken, sha256Hex } from '../../functions/_shared/auth/tokens.ts'

describe('auth tokens', () => {
  it('randomToken length and uniqueness', () => {
    const a = randomToken(16)
    const b = randomToken(16)
    assert.equal(a.length, 32)
    assert.notEqual(a, b)
  })

  it('sha256 stable', async () => {
    assert.equal(await sha256Hex('x'), await sha256Hex('x'))
    assert.notEqual(await sha256Hex('x'), await sha256Hex('y'))
  })
})
