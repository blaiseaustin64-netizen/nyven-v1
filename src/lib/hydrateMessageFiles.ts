
import type { Message } from './types'

/** Rebuild object URLs from persisted base64 so download cards work after reload. */
export function hydrateMessageFiles(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (!m.files?.length) return m
    const files = m.files.map((f) => {
      if (f.href) return f
      if (f.base64) {
        try {
          const bin = atob(f.base64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const blob = new Blob([bytes], { type: f.mimeType || 'application/octet-stream' })
          return { ...f, href: URL.createObjectURL(blob) }
        } catch {
          return f
        }
      }
      return f
    })
    return { ...m, files }
  })
}
