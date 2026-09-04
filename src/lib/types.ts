export type MessageRole = 'user' | 'nyven'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  isThinking?: boolean
  isStreaming?: boolean
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
