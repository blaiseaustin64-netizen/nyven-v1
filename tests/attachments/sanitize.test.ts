import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeExtractedText, looksLikeBinaryOrMarkup } from '../../src/lib/attachments/sanitize.ts'

describe('sanitize extracted text', () => {
  it('rejects raw docx xml', () => {
    const xml = '<?xml <w:document><w:t>Hello</w:t></w:document> endstream'
    assert.equal(looksLikeBinaryOrMarkup(xml), true)
    assert.equal(sanitizeExtractedText(xml), '')
  })
  it('keeps clean prose', () => {
    const t = 'Chapter one begins with a quiet morning in the village.'
    assert.equal(sanitizeExtractedText(t), t)
  })
})
