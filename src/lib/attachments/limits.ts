/**
 * Centralized attachment limits — used by client UX and documented for server.
 * Server re-validates independently (never trust the client).
 */

export const ATTACHMENT_LIMITS = {
  MAX_FILES_PER_MESSAGE: 5,
  /** Per-file max (bytes) */
  MAX_FILE_SIZE: 8 * 1024 * 1024, // 8 MB
  MAX_ZIP_FILE_SIZE: 8 * 1024 * 1024,
  /** Sum of all files in one message */
  MAX_TOTAL_UPLOAD_SIZE: 24 * 1024 * 1024,
  /** Max characters of extracted text sent to the model */
  MAX_EXTRACTED_TEXT_CHARS: 120_000,
  /** Max base64 payload we keep for a single image/pdf inline */
  MAX_INLINE_BYTES: 7 * 1024 * 1024,
} as const

/** Allowlisted extensions → canonical MIME */
export const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

export const ALLOWED_MIME_TYPES = new Set([
  ...Object.values(ALLOWED_EXTENSIONS),
  'application/x-zip-compressed',
])

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0) return ''
  return filename.slice(i).toLowerCase()
}

export function kindForMime(mime: string): 'image' | 'document' | 'text' {
  if (mime.startsWith('image/')) return 'image'
  if (
    mime === 'application/pdf' ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime.includes('officedocument')
  ) {
    return 'document'
  }
  return 'text'
}
