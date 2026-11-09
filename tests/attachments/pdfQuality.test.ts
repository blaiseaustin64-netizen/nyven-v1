import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isReadableText } from '../../src/lib/attachments/pdfjsLoader.ts'

describe('PDF text quality', () => {
  it('rejects empty and gibberish', () => {
    assert.equal(isReadableText(''), false)
    assert.equal(isReadableText('%%%%####(((( 1111'), false)
    assert.equal(isReadableText('a b c'), false)
  })
  it('accepts normal prose', () => {
    assert.equal(
      isReadableText(
        'This is a normal paragraph about project planning and timelines for the team.'
      ),
      true
    )
  })
})
