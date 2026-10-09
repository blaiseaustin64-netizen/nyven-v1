/**
 * Shared conversation list for the main Sidebar + Chat page.
 * Uses existing chatPersistence (Supabase / localStorage) — no second store.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { Conversation, Message } from '../types'
import {
  listConversations,
  deleteConversation as deleteConversationRemote,
  newConversationId,
} from '../chatPersistence'
import { useAuth } from '../auth/AuthContext'
import { getSupabase } from '../supabase/client'

type Ctx = {
  conversations: Conversation[]
  loading: boolean
  activeId: string
  setActiveId: (id: string) => void
  refresh: () => Promise<void>
  startNewChat: () => string
  openConversation: (c: Conversation) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  /** Chat calls after persist so sidebar titles stay in sync */
  upsertConversationMeta: (id: string, patch: Partial<Conversation>) => void
}

const ConversationHistoryContext = createContext<Ctx | null>(null)

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const navigate = useNavigate()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(() => newConversationId())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listConversations(userId)
      setConversations(list)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startNewChat = useCallback(() => {
    const id = newConversationId()
    setActiveId(id)
    navigate('/chat')
    return id
  }, [navigate])

  const openConversation = useCallback(
    (c: Conversation) => {
      setActiveId(c.id)
      navigate('/chat')
    },
    [navigate]
  )

  const deleteConversation = useCallback(
    (id: string) => {
      void deleteConversationRemote(userId, id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      setActiveId((cur) => (cur === id ? newConversationId() : cur))
    },
    [userId]
  )

  const renameConversation = useCallback(
    (id: string, title: string) => {
      const next = title.slice(0, 120)
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: next, updatedAt: Date.now() } : c))
      )
      void (async () => {
        if (!userId) {
          try {
            const raw = localStorage.getItem('nyven_chat_history_v1')
            if (!raw) return
            const list = JSON.parse(raw) as Conversation[]
            const updated = list.map((c) =>
              c.id === id ? { ...c, title: next, updatedAt: Date.now() } : c
            )
            localStorage.setItem('nyven_chat_history_v1', JSON.stringify(updated))
          } catch {
            /* ignore */
          }
          return
        }
        const sb = getSupabase()
        if (!sb) return
        await sb.from('conversations').update({ title: next }).eq('id', id).eq('user_id', userId)
      })()
    },
    [userId]
  )

  const upsertConversationMeta = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === id)
      if (!exists) {
        return [
          {
            id,
            title: patch.title || 'Chat',
            messages: patch.messages || [],
            updatedAt: patch.updatedAt || Date.now(),
          },
          ...prev,
        ]
      }
      return prev.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              updatedAt: patch.updatedAt || Date.now(),
            }
          : c
      )
    })
  }, [])

  const value = useMemo(
    () => ({
      conversations,
      loading,
      activeId,
      setActiveId,
      refresh,
      startNewChat,
      openConversation,
      deleteConversation,
      renameConversation,
      upsertConversationMeta,
    }),
    [
      conversations,
      loading,
      activeId,
      refresh,
      startNewChat,
      openConversation,
      deleteConversation,
      renameConversation,
      upsertConversationMeta,
    ]
  )

  return (
    <ConversationHistoryContext.Provider value={value}>
      {children}
    </ConversationHistoryContext.Provider>
  )
}

export function useConversationHistory(): Ctx {
  const ctx = useContext(ConversationHistoryContext)
  if (!ctx) {
    throw new Error('useConversationHistory must be used within ConversationHistoryProvider')
  }
  return ctx
}
