import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  isStrongPassword,
  normalizeEmail,
} from '../../functions/_shared/auth/password.ts'

describe('password hashing', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('correct horse battery')
    assert.match(h, /^pbkdf2\$310000\$/)
    assert.equal(await verifyPassword('correct horse battery', h), true)
    assert.equal(await verifyPassword('wrong', h), false)
  })

  it('email helpers', () => {
    assert.equal(normalizeEmail('  A@B.Com '), 'a@b.com')
    assert.equal(isValidEmail('a@b.com'), true)
    assert.equal(isValidEmail('nope'), false)
    assert.equal(isStrongPassword('short'), false)
    assert.equal(isStrongPassword('longenough'), true)
  })
})
