import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { ChatMessage } from '../components/ChatMessage'
import { MessageComposer } from '../components/MessageComposer'
import { NIdentity } from '../components/NIdentity'
import { mockConversations, generateMockResponse } from '../lib/mockData'
import type { Message, Conversation } from '../lib/types'

export function Chat() {
  const location = useLocation()
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations)
  const [activeId, setActiveId] = useState<string>(mockConversations[0]?.id || 'new')
  const [messages, setMessages] = useState<Message[]>(
    mockConversations[0]?.messages || []
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [thinkingLabel, setThinkingLabel] = useState('Thinking...')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Handle initial message from Home
  useEffect(() => {
    const state = location.state as { initialMessage?: string } | null
    if (state?.initialMessage) {
      handleSend(state.initialMessage)
      // Clear state
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line

  const startNewChat = () => {
    const id = `c-${Date.now()}`
    setActiveId(id)
    setMessages([])
    setConversations((prev) => [
      { id, title: 'New conversation', messages: [], updatedAt: Date.now() },
      ...prev,
    ])
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
      content: thinkingLabel,
      timestamp: Date.now(),
      isThinking: true,
    }

    setMessages((prev) => [...prev, userMsg, thinkingMsg])
    setIsGenerating(true)

    // Simulate thinking phases
    const phases = ['Thinking...', 'Thinking through this...']
    let phaseIdx = 0
    const phaseInterval = setInterval(() => {
      if (abortRef.current) {
        clearInterval(phaseInterval)
        return
      }
      phaseIdx = (phaseIdx + 1) % phases.length
      setThinkingLabel(phases[phaseIdx])
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.isThinking) {
          next[next.length - 1] = { ...last, content: phases[phaseIdx] }
        }
        return next
      })
    }, 900)

    // Mock delay
    await new Promise((r) => setTimeout(r, 1800 + Math.random() * 800))

    clearInterval(phaseInterval)

    if (abortRef.current) {
      setIsGenerating(false)
      setMessages((prev) => prev.filter((m) => !m.isThinking))
      return
    }

    const response = generateMockResponse(text)
    const nyvenMsg: Message = {
      id: `n-${Date.now()}`,
      role: 'nyven',
      content: response,
      timestamp: Date.now(),
    }

    setMessages((prev) => {
      const withoutThinking = prev.filter((m) => !m.isThinking)
      return [...withoutThinking, nyvenMsg]
    })
    setIsGenerating(false)

    // Update conversation title if new
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === activeId)
      if (!exists) {
        return [
          {
            id: activeId,
            title: text.slice(0, 40) + (text.length > 40 ? '…' : ''),
            messages: [userMsg, nyvenMsg],
            updatedAt: Date.now(),
          },
          ...prev,
        ]
      }
      return prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              title: c.title === 'New conversation' ? text.slice(0, 40) : c.title,
              messages: [...c.messages, userMsg, nyvenMsg],
              updatedAt: Date.now(),
            }
          : c
      )
    })
  }

  const handleStop = () => {
    abortRef.current = true
    setIsGenerating(false)
    setMessages((prev) => prev.filter((m) => !m.isThinking))
  }

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      setMessages((prev) => {
        // Remove last nyven message
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
      {/* Conversation list - desktop */}
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
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-xl ${
                activeId === c.id ? 'bg-nyven-surface' : 'hover:bg-white/[0.03]'
              }`}
            >
              <button
                onClick={() => {
                  setActiveId(c.id)
                  setMessages(c.messages)
                }}
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

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Messages */}
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
                isLast={idx === messages.length - 1 && msg.role === 'nyven' && !msg.isThinking}
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

        {/* Composer */}
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
