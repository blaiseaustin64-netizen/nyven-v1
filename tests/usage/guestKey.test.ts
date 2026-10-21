/**
 * Guest key hashing tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sha256Hex, mintGuestCookieValue } from '../../functions/_shared/db/guestKey.ts'

describe('guest key', () => {
  it('sha256Hex is stable', async () => {
    const a = await sha256Hex('nyven-guest:v1:test')
    const b = await sha256Hex('nyven-guest:v1:test')
    assert.equal(a, b)
    assert.equal(a.length, 64)
  })

  it('mintGuestCookieValue is long enough', () => {
    const v = mintGuestCookieValue()
    assert.ok(v.length >= 32)
  })
})
