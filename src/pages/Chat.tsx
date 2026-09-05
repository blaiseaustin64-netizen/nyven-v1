import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { ChatMessage } from '../components/ChatMessage'
import { MessageComposer } from '../components/MessageComposer'
import { NIdentity } from '../components/NIdentity'
import type { Message, Conversation } from '../lib/types'

const STORAGE_KEY = 'nyven_chat_history_v1'

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Conversation[]
  } catch {
    return []
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  } catch {
    // storage full or unavailable — fail silently
  }
}

export function Chat() {
  const location = useLocation()
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  )
  const [activeId, setActiveId] = useState<string>(() => `c-${Date.now()}`)
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  useEffect(() => {
    const state = location.state as { initialMessage?: string } | null
    if (state?.initialMessage) {
      handleSend(state.initialMessage)
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line

  const startNewChat = () => {
    setActiveId(`c-${Date.now()}`)
    setMessages([])
  }

  const openConversation = (c: Conversation) => {
    setActiveId(c.id)
    setMessages(c.messages)
    setTimeout(scrollToBottom, 50)
  }

  const handleSend = async (text: string) => {
    if (isGenerating) return
    abortRef.current = false

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const thinkingMsg: Message = {
      id: `t-${Date.now()}`,
      role: 'nyven',
      content: 'Thinking...',
      timestamp: Date.now(),
      isThinking: true,
    }

    setMessages((prev) => [...prev, userMsg, thinkingMsg])
    setIsGenerating(true)
    scrollToBottom()

    const phases = ['Thinking...', 'Thinking through this...']
    let phaseIdx = 0
    const phaseInterval = setInterval(() => {
      if (abortRef.current) {
        clearInterval(phaseInterval)
        return
      }
      phaseIdx = (phaseIdx + 1) % phases.length
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.isThinking) {
          next[next.length - 1] = { ...last, content: phases[phaseIdx] }
        }
        return next
      })
    }, 900)

    const history = messages
      .filter((m) => !m.isThinking)
      .map((m) => ({
        role: m.role === 'nyven' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }))

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      })

      clearInterval(phaseInterval)

      if (abortRef.current) {
        setIsGenerating(false)
        setMessages((prev) => prev.filter((m) => !m.isThinking))
        return
      }

      const data = await res.json()

      if (!res.ok || !data.success) {
        const errorText = data?.error || 'Something went wrong. Please try again.'
        const errorMsg: Message = {
          id: `n-${Date.now()}`,
          role: 'nyven',
          content: errorText,
          timestamp: Date.now(),
        }
        setMessages((prev) => {
          const withoutThinking = prev.filter((m) => !m.isThinking)
          const updated = [...withoutThinking, errorMsg]
          scrollToBottom()
          return updated
        })
        setIsGenerating(false)
        return
      }

      const nyvenMsg: Message = {
        id: `n-${Date.now()}`,
        role: 'nyven',
        content: data.message,
        timestamp: Date.now(),
      }

      setMessages((prev) => {
        const withoutThinking = prev.filter((m) => !m.isThinking)
        const updated = [...withoutThinking, nyvenMsg]

        setConversations((prevConvos) => {
          const exists = prevConvos.find((c) => c.id === activeId)
          const title = text.slice(0, 40) + (text.length > 40 ? '…' : '')
          if (!exists) {
            return [
              { id: activeId, title, messages: updated, updatedAt: Date.now() },
              ...prevConvos,
            ]
          }
          return prevConvos.map((c) =>
            c.id === activeId
              ? { ...c, messages: updated, updatedAt: Date.now() }
              : c
          )
        })

        return updated
      })

      setIsGenerating(false)
      scrollToBottom()
    } catch (err: unknown) {
      clearInterval(phaseInterval)

      if (abortRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        setIsGenerating(false)
        setMessages((prev) => prev.filter((m) => !m.isThinking))
        return
      }

      const errorMsg: Message = {
        id: `n-${Date.now()}`,
        role: 'nyven',
        content: 'I could not reach the intelligence service. Please try again.',
        timestamp: Date.now(),
      }
      setMessages((prev) => {
        const withoutThinking = prev.filter((m) => !m.isThinking)
        scrollToBottom()
        return [...withoutThinking, errorMsg]
      })
      setIsGenerating(false)
    }
  }

  const handleStop = () => {
    abortRef.current = true
    abortControllerRef.current?.abort()
    setIsGenerating(false)
    setMessages((prev) => prev.filter((m) => !m.isThinking))
  }

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      setMessages((prev) => {
        const idx = prev.map((m) => m.role).lastIndexOf('nyven')
        if (idx >= 0) return prev.slice(0, idx)
        return prev
      })
      handleSend(lastUser.content)
    }
  }

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) {
      startNewChat()
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden md:flex flex-col w-64 border-r border-white/[0.05] bg-nyven-bg-secondary/30">
        <div className="p-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm font-medium hover:border-nyven-cyan/20 transition-colors"
          >
            <Plus size={16} className="text-nyven-cyan" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-nyven-text-secondary/50 text-center mt-6 px-4">
              Your conversations will appear here.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-xl ${
                activeId === c.id ? 'bg-nyven-surface' : 'hover:bg-white/[0.03]'
              }`}
            >
              <button
                onClick={() => openConversation(c)}
                className="flex-1 text-left px-3 py-2.5 text-sm truncate text-nyven-text-secondary hover:text-nyven-text"
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                className="p-2 opacity-0 group-hover:opacity-100 text-nyven-text-secondary hover:text-red-400 transition-opacity"
                aria-label="Delete conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <NIdentity state="white" size={48} className="mb-5 opacity-80" />
                <h2 className="font-display text-xl font-medium mb-2">
                  Start a conversation
                </h2>
                <p className="text-nyven-text-secondary text-sm max-w-sm">
                  Ask anything. Build ideas. Write code. Explore what's next.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isLast={
                  idx === messages.length - 1 &&
                  msg.role === 'nyven' &&
                  !msg.isThinking
                }
                onRegenerate={
                  idx === messages.length - 1 && msg.role === 'nyven'
                    ? handleRegenerate
                    : undefined
                }
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <MessageComposer
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={handleStop}
          autoFocus
        />
      </div>
    </div>
  )
                            }
