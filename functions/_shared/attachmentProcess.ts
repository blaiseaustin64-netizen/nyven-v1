/**
 * Process uploaded bytes into model-ready attachment payloads.
 * No persistent object storage configured — content is returned once to the client.
 */

import {
  ATTACHMENT_LIMITS,
  kindForMime,
  resolveMime,
} from './attachmentLimits'

export type ProcessedAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'document' | 'text'
  extractedText?: string
  inlineBase64?: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function truncateText(text: string, max = ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS): string {
  if (text.length <= max) return text
  return (
    text.slice(0, max) +
    `\n\n[…truncated: showing first ${max.toLocaleString()} of ${text.length.toLocaleString()} characters]`
  )
}

/**
 * Naive PDF text extraction: pull printable strings from content streams.
 * Works for many text-based PDFs; scanned/image-only PDFs yield little text.
 * Gemini still receives the PDF as inline binary for true multimodal analysis when size allows.
 */
function extractPdfTextRough(bytes: Uint8Array): string {
  try {
    const raw = new TextDecoder('latin1').decode(bytes)
    const parts: string[] = []
    // Text in parentheses (simple PDF string literals)
    const re = /\((?:\\.|[^\\()])*\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      let s = m[0].slice(1, -1)
      s = s
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
      if (s.trim().length > 1) parts.push(s)
    }
    // Also BT ... Tj style fragments as fallback noise filter
    const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
    return joined
  } catch {
    return ''
  }
}

export function processFileBytes(
  filename: string,
  claimedMime: string | undefined,
  buffer: ArrayBuffer
): { ok: true; attachment: ProcessedAttachment } | { ok: false; code: string; message: string } {
  const size = buffer.byteLength
  if (size <= 0) {
    return { ok: false, code: 'EMPTY_FILE', message: 'The file appears to be empty.' }
  }
  if (size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `Each file must be under ${Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024))} MB.`,
    }
  }

  const mime = resolveMime(filename, claimedMime)
  if (!mime) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILE_TYPE',
      message:
        'Unsupported file type. Use PNG, JPEG, WEBP, GIF, PDF, TXT, Markdown, JSON, or CSV.',
    }
  }

  const kind = kindForMime(mime)
  const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const name = filename.slice(0, 200) || 'file'

  if (kind === 'image') {
    if (size > ATTACHMENT_LIMITS.MAX_INLINE_BYTES) {
      return {
        ok: false,
        code: 'FILE_TOO_LARGE',
        message: 'This image is too large to analyze. Try a smaller file.',
      }
    }
    return {
      ok: true,
      attachment: {
        id,
        name,
        mimeType: mime,
        size,
        kind,
        inlineBase64: arrayBufferToBase64(buffer),
      },
    }
  }

  if (mime === 'application/pdf') {
    const bytes = new Uint8Array(buffer)
    const extracted = truncateText(extractPdfTextRough(bytes))
    const canInline = size <= ATTACHMENT_LIMITS.MAX_INLINE_BYTES
    return {
      ok: true,
      attachment: {
        id,
        name,
        mimeType: mime,
        size,
        kind: 'document',
        extractedText: extracted || undefined,
        inlineBase64: canInline ? arrayBufferToBase64(buffer) : undefined,
      },
    }
  }

  // Text-like documents
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    return {
      ok: true,
      attachment: {
        id,
        name,
        mimeType: mime,
        size,
        kind: 'text',
        extractedText: truncateText(text),
      },
    }
  } catch {
    return {
      ok: false,
      code: 'PROCESS_FAILED',
      message: 'Could not read this file as text.',
    }
  }
}
