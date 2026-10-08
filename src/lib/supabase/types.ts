export type ProfileRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ConversationRow = {
  id: string
  user_id: string
  title: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export type MemoryRow = {
  id: string
  user_id: string
  content: string
  memory_type: 'fact' | 'preference' | 'context' | 'instruction'
  source: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export type UsageEventRow = {
  id: string
  user_id: string
  event_type: string
  quantity: number
  metadata: Record<string, unknown>
  created_at: string
}

export type ConnectionPublicRow = {
  id: string
  user_id: string
  provider: string
  status: string
  account_label: string | null
  scopes: string[] | null
  metadata: Record<string, unknown>
  connected_at: string | null
  created_at: string
  updated_at: string
}
