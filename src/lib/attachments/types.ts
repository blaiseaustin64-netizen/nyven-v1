export type AttachmentStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'cancelled'

export type AttachmentKind = 'image' | 'document' | 'text'

/** Safe metadata stored in conversation history (no base64 / huge text) */
export type AttachmentMeta = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: AttachmentKind
}

/**
 * In-memory pending attachment for the composer (not written to localStorage wholesale).
 */
export type PendingAttachment = AttachmentMeta & {
  status: AttachmentStatus
  error?: string
  previewUrl?: string
  extractedText?: string
  inlineBase64?: string
  abortController?: AbortController
}

/** Payload sent to Core with a chat message */
export type AttachmentPayload = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: AttachmentKind
  extractedText?: string
  inlineBase64?: string
}

export type AttachmentUploadResponse = {
  success: boolean
  attachment?: AttachmentPayload & { status: 'ready' }
  error?: string
  code?: string
}
