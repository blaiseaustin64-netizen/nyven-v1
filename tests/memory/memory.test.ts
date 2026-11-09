import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractFactsHeuristic,
  isSensitiveOrForbidden,
  scoreMemory,
  normalizeFact,
} from '../../functions/_shared/memory/service.ts'

describe('memory extraction filter', () => {
  it('skips sensitive text', () => {
    assert.equal(isSensitiveOrForbidden('my password is hunter2'), true)
    assert.equal(isSensitiveOrForbidden('api_key=sk-abc'), true)
    assert.equal(isSensitiveOrForbidden('I prefer dark mode'), false)
  })

  it('extracts durable preferences and skips small talk', () => {
    assert.deepEqual(extractFactsHeuristic('hi', 'hello'), [])
    const facts = extractFactsHeuristic('My name is Ada and I prefer TypeScript.', 'Great!')
    assert.ok(facts.length >= 1)
    assert.ok(facts.some((f) => /Ada|TypeScript/i.test(f)))
  })
})

describe('memory ranking', () => {
  it('scores relevant memories higher', () => {
    const a = scoreMemory('User prefers TypeScript and React', 'typescript project')
    const b = scoreMemory('User likes coffee', 'typescript project')
    assert.ok(a > b)
  })
})

describe('memory normalize / dedupe shape', () => {
  it('trims and caps fact length', () => {
    const n = normalizeFact('  hello   world  ' + 'x'.repeat(600))
    assert.ok(n.startsWith('hello world'))
    assert.ok(n.length <= 500)
  })
})
