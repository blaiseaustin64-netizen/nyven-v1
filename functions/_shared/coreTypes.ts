/**
 * NYVEN Core types — shared by HTTP routes and runtime.
 * Future-compatible with tools, agents, voice, multimodal.
 */

export type ActivityState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'analyzing'
  | 'generating'
  | 'executing'
  | 'waiting_for_approval'
  | 'speaking'
  | 'listening'
  | 'completed'
  | 'error'

export type CoreHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

/** Multimodal attachment reference for Core (no browser File objects). */
export type AttachmentPayload = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'document' | 'text'
  extractedText?: string
  /** Base64 without data-url prefix — images and PDFs for Gemini inline */
  inlineBase64?: string
}

/** Authenticated identity resolved server-side (never trust client userId). */
export type CoreIdentity = {
  authenticated: boolean
  userId?: string
}

/** Future-compatible request. Attachments/agent not processed in Phase 2. */
export type CoreRequest = {
  message: string
  history?: CoreHistoryMessage[]
  attachments?: AttachmentPayload[] | null
  /** Reserved — user profile / auth context */
  userContext?: Record<string, unknown> | null
  /** Server-resolved identity (JWT verified on Worker) */
  identity?: CoreIdentity | null
  /** Reserved — agent brain / skills */
  agentContext?: Record<string, unknown> | null
  mode?: 'chat' | 'agent' | string
  metadata?: {
    messageId?: string
    conversationId?: string
    client?: string
  }
}

export type CoreEventType =
  | 'activity'
  | 'attachment_status'
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'action_proposal'
  | 'done'
  | 'error'

export type CoreActivityEvent = {
  type: 'activity'
  state: ActivityState
  detail?: string
  timestamp: number
}

export type CoreTokenEvent = {
  type: 'token'
  text: string
  timestamp: number
}

export type CoreAttachmentStatusEvent = {
  type: 'attachment_status'
  attachmentId: string
  status: 'processing' | 'ready' | 'error'
  detail?: string
  timestamp: number
}

export type CoreDoneEvent = {
  type: 'done'
  messageId: string
  timestamp: number
  citations?: Array<{ id: string; title: string; url: string; source?: string }>
}

export type CoreErrorEvent = {
  type: 'error'
  code: string
  message: string
  timestamp: number
}

/** Future tool protocol shapes (not emitted in Phase 2 chat) */
export type CoreToolCallEvent = {
  type: 'tool_call'
  toolCallId: string
  toolId: string
  input?: unknown
  timestamp: number
}

export type CoreToolResultEvent = {
  type: 'tool_result'
  toolCallId: string
  toolId: string
  success: boolean
  summary?: string
  timestamp: number
}

export type CoreActionProposalEvent = {
  type: 'action_proposal'
  id: string
  action: string
  payload?: Record<string, unknown>
  timestamp: number
}

export type CoreEvent =
  | CoreActivityEvent
  | CoreAttachmentStatusEvent
  | CoreTokenEvent
  | CoreDoneEvent
  | CoreErrorEvent
  | CoreToolCallEvent
  | CoreToolResultEvent
  | CoreActionProposalEvent

export type CoreResult = {
  messageId: string
  text: string
  aborted?: boolean
  error?: { code: string; message: string }
}

export type EmitFn = (event: CoreEvent) => void
