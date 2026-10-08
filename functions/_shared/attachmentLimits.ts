/** Server-side attachment limits (must match client policy). */

export const ATTACHMENT_LIMITS = {
  MAX_FILES_PER_MESSAGE: 5,
  MAX_FILE_SIZE: 8 * 1024 * 1024,
  MAX_TOTAL_UPLOAD_SIZE: 20 * 1024 * 1024,
  MAX_EXTRACTED_TEXT_CHARS: 80_000,
  MAX_INLINE_BYTES: 7 * 1024 * 1024,
} as const

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
}

export const ALLOWED_MIME = new Set(Object.values(ALLOWED_EXTENSIONS))

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function resolveMime(filename: string, claimed?: string): string | null {
  const ext = extensionOf(filename)
  const fromExt = ALLOWED_EXTENSIONS[ext]
  if (!fromExt) return null
  // Prefer extension mapping over client claim (anti-spoof)
  if (claimed && claimed !== fromExt) {
    // Allow common jpeg aliases
    if (
      (fromExt === 'image/jpeg' && (claimed === 'image/jpg' || claimed === 'image/pjpeg')) ||
      claimed === fromExt
    ) {
      return fromExt
    }
    // Still use extension as source of truth when claimed differs
    return fromExt
  }
  return fromExt
}

export function kindForMime(mime: string): 'image' | 'document' | 'text' {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'document'
  return 'text'
}
