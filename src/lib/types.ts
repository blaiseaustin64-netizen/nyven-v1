export type MessageRole = 'user' | 'nyven'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  /** True while waiting for first token (activity: thinking) */
  isThinking?: boolean
  /** True while tokens are still arriving */
  isStreaming?: boolean
  /** Real Core activity state from the server stream */
  activityState?:
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
  activityDetail?: string
  /** Safe attachment metadata only (no base64 in localStorage) */
  attachments?: Array<{
    id: string
    name: string
    mimeType: string
    size: number
    kind: 'image' | 'document' | 'text'
  }>
  citations?: Array<{ id: string; title: string; url: string; source?: string }>
  toolSummary?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  type: string
  lastEdited: string
  preview?: string
  description?: string
  slug?: string
}

export type Page =
  | 'home'
  | 'chat'
  | 'build'
  | 'builder'
  | 'projects'
  | 'agents'
  | 'nyven-plus'
  | 'settings'
  | 'profile'

export type ThinkingPhase =
  | 'idle'
  | 'thinking'
  | 'understanding'
  | 'planning'
  | 'designing'
  | 'building'
  | 'writing'
  | 'rendering'
  | 'ready'
