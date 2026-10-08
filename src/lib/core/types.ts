/** Client-side Core protocol types (mirror of server events). */

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



export type CoreErrorEvent = {
  type: 'error'
  code: string
  message: string
  timestamp: number
}

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

export type CoreCitation = {
  id: string
  title: string
  url: string
  source?: string
}

export type CoreDoneEvent = {
  type: 'done'
  messageId: string
  timestamp: number
  citations?: CoreCitation[]
}

export type CoreEvent =
  | CoreActivityEvent
  | CoreTokenEvent
  | CoreDoneEvent
  | CoreErrorEvent
  | CoreToolCallEvent
  | CoreToolResultEvent
  | { type: string; [key: string]: unknown }

export type StreamHandlers = {
  onActivity?: (state: ActivityState, detail?: string) => void
  onToken?: (text: string) => void
  onToolCall?: (toolId: string, input?: unknown) => void
  onToolResult?: (toolId: string, success: boolean, summary?: string) => void
  onDone?: (
    messageId: string,
    citations?: Array<{ id: string; title: string; url: string; source?: string }>
  ) => void
  onError?: (code: string, message: string) => void
}
