import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, History, Bug } from 'lucide-react'
import { ChatHistoryPanel } from '../components/ChatHistoryPanel'
import { BugReportModal } from '../components/BugReportModal'
import { ChatMessage } from '../components/ChatMessage'
import { MessageComposer, type ComposerSendPayload } from '../components/MessageComposer'
import { NIdentity } from '../components/NIdentity'
import { VoiceChatScreen } from '../components/voice/VoiceChatScreen'
import type { Message, Conversation } from '../lib/types'
import { streamCoreChat } from '../lib/core/streamClient'
import type { ActivityState } from '../lib/core/types'
import { VoiceController, type VoicePhase } from '../lib/voice/controller'
import { getVoicePreferences } from '../lib/voice/preferences'
import { useAuth } from '../lib/auth/AuthContext'
import { getSupabase } from '../lib/supabase/client'
import {
  listConversations,
  loadConversationMessages,
  ensureConversation,
  persistMessage,
  deleteConversation as deleteConversationRemote,
  newConversationId,
} from '../lib/chatPersistence'
import { buildMemoryContext } from '../lib/memoryStore'
import { recordUsage } from '../lib/usageTracking'


export function Chat() {
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>(() => newConversationId())
  const [historyLoading, setHistoryLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const [voiceEnergy, setVoiceEnergy] = useState(0)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [fromVoice, setFromVoice] = useState(false)
  const [voiceChatOpen, setVoiceChatOpen] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null)
  const [lastVoiceReply, setLastVoiceReply] = useState<string | null>(null)
  const voiceChatOpenRef = useRef(false)
  const voiceMutedRef = useRef(false)
  const voiceRef = useRef<VoiceController | null>(null)
  /** Always-current send for async voice callbacks (avoids stale closures) */
  const handleSendRef = useRef<
    (payload: ComposerSendPayload | string, opts?: { fromVoice?: boolean }) => Promise<void>
  >(async () => {})
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const isGeneratingRef = useRef(isGenerating)
  isGeneratingRef.current = isGenerating
  /** Voice-originated turn — ref so stream onDone sees the real flag */
  const fromVoiceRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamMsgIdRef = useRef<string | null>(null)
  const tokenBufferRef = useRef('')
  const streamContentRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    void listConversations(userId).then((list) => {
      if (!cancelled) {
        setConversations(list)
        setHistoryLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const vc = new VoiceController()
    voiceRef.current = vc
    vc.setHandlers({
      onPhase: (phase) => {
        setVoicePhase(phase)
        if (phase === 'idle') setVoiceEnergy(0)
      },
      onListenLevel: (level) => setVoiceEnergy(level),
      onSpeakEnergy: (level) => setVoiceEnergy(level),
      onTranscript: (text) => {
        // Mark voice origin via ref BEFORE send so stream onDone sees it
        fromVoiceRef.current = true
        setFromVoice(true)
        setLastVoiceTranscript(text)
        // Always call the latest handleSend (never a mount-time stale closure)
        void handleSendRef.current({ text, attachments: [] }, { fromVoice: true })
      },
      onError: (message) => {
        fromVoiceRef.current = false
        setFromVoice(false)
        setVoiceError(message)
        setTimeout(() => setVoiceError(null), 5000)
      },
    })
    return () => {
      vc.stopAll()
      voiceRef.current = null
    }
  }, [])

  useEffect(() => {
    const state = location.state as { initialMessage?: string } | null
    if (state?.initialMessage) {
      void handleSend(state.initialMessage)
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startNewChat = () => {
    setActiveId(newConversationId())
    setMessages([])
    setHistoryOpen(false)
  }

  const openConversation = async (c: Conversation) => {
    setActiveId(c.id)
    setHistoryOpen(false)
    if (c.messages?.length) {
      setMessages(c.messages)
    } else {
      const msgs = await loadConversationMessages(userId, c.id)
      setMessages(msgs)
    }
    setTimeout(scrollToBottom, 50)
  }

  const persistMessages = useCallback(
    (updated: Message[], titleSource?: string) => {
      const titleBase =
        titleSource || updated.find((m) => m.role === 'user')?.content || 'Chat'
      const title =
        titleBase.slice(0, 40) + (titleBase.length > 40 ? '…' : '')

      setConversations((prevConvos) => {
        const exists = prevConvos.find((c) => c.id === activeId)
        if (!exists) {
          return [
            {
              id: activeId,
              title: title || 'Chat',
              messages: updated,
              updatedAt: Date.now(),
            },
            ...prevConvos,
          ]
        }
        return prevConvos.map((c) =>
          c.id === activeId
            ? { ...c, title: title || c.title, messages: updated, updatedAt: Date.now() }
            : c
        )
      })

      // Durable write (non-blocking). Streaming UI is already updated.
      void (async () => {
        try {
          const convId = await ensureConversation(userId, activeId, title || 'Chat')
          const last = updated[updated.length - 1]
          if (last && !last.isThinking && !last.isStreaming) {
            await persistMessage(userId, convId, last, title)
          }
          // Also persist the prior user message if present
          const lastUser = [...updated].reverse().find((m) => m.role === 'user')
          if (lastUser) {
            await persistMessage(userId, convId, lastUser, title)
          }
        } catch (e) {
          console.warn('persist failed', e)
        }
      })()
    },
    [activeId, userId]
  )

  const flushTokens = useCallback(() => {
    const chunk = tokenBufferRef.current
    if (!chunk || !streamMsgIdRef.current) return
    tokenBufferRef.current = ''
    const id = streamMsgIdRef.current
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const next = m.content + chunk
        streamContentRef.current = next
        return {
          ...m,
          content: next,
          isThinking: false,
          isStreaming: true,
          activityState: 'generating' as ActivityState,
        }
      })
    )
    scrollToBottom()
  }, [scrollToBottom])

  const queueToken = useCallback(
    (text: string) => {
      tokenBufferRef.current += text
      if (flushTimerRef.current) return
      // Brief coalesce to reduce React churn — not artificial latency theater
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        flushTokens()
      }, 32)
    },
    [flushTokens]
  )

  const handleStop = () => {
    voiceRef.current?.stopAll()
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flushTokens()
    const id = streamMsgIdRef.current
    if (id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                isThinking: false,
                isStreaming: false,
                activityState: 'completed',
                activityDetail: undefined,
              }
            : m
        )
      )
    }
    setIsGenerating(false)
    isGeneratingRef.current = false
    fromVoiceRef.current = false
    setFromVoice(false)
  }

  const handleSend = async (
    payload: ComposerSendPayload | string,
    opts?: { fromVoice?: boolean }
  ) => {
    if (isGeneratingRef.current) return

    const text = typeof payload === 'string' ? payload : payload.text
    const filePayloads = typeof payload === 'string' ? [] : payload.attachments || []

    // Capture voice-origin at call time (ref + explicit opt). Do not rely on React state timing.
    const voiceOrigin = Boolean(opts?.fromVoice) || fromVoiceRef.current
    if (opts?.fromVoice) fromVoiceRef.current = true

    const convId = activeIdRef.current
    const historySnapshot = messagesRef.current
      .filter((m) => !m.isThinking && !m.isStreaming && m.content)
      .map((m) => ({
        role: (m.role === 'nyven' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }))

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || (filePayloads.length ? 'Analyze the attached file(s).' : ''),
      timestamp: Date.now(),
      attachments: filePayloads.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        kind: a.kind,
      })),
    }

    const streamId = `n-${Date.now()}`
    streamMsgIdRef.current = streamId
    tokenBufferRef.current = ''
    streamContentRef.current = ''

    const streamMsg: Message = {
      id: streamId,
      role: 'nyven',
      content: '',
      timestamp: Date.now(),
      isThinking: true,
      isStreaming: true,
      activityState: 'thinking',
      activityDetail: 'Understanding your message',
    }

    const history = historySnapshot

    setMessages((prev) => [...prev, userMsg, streamMsg])
    setIsGenerating(true)
    isGeneratingRef.current = true
    scrollToBottom()
    void recordUsage(userId, 'message')
    void ensureConversation(userId, convId, text.slice(0, 40) || 'Chat')
    void persistMessage(userId, convId, userMsg, text.slice(0, 40))

    const controller = new AbortController()
    abortControllerRef.current = controller

    let sawError = false

    try {
      let accessToken: string | null = null
      if (userId) {
        try {
          const sb = getSupabase()
          const { data } = await sb?.auth.getSession() ?? { data: { session: null } }
          accessToken = data.session?.access_token ?? null
        } catch {
          accessToken = null
        }
      }
      const memoryCtx = await buildMemoryContext(userId)
      const coreMessage = [memoryCtx, text || 'Please analyze the attached content.']
        .filter(Boolean)
        .join('\n\n')
      await streamCoreChat(
        {
          message: coreMessage,
          accessToken,
          history,
          attachments: filePayloads,
          signal: controller.signal,
        },
        {
          onActivity: (state: ActivityState, detail?: string) => {
            if (controller.signal.aborted) return
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      activityState: state,
                      activityDetail: detail,
                      isThinking: state === 'thinking' && !m.content,
                      isStreaming: state === 'generating' || state === 'thinking',
                    }
                  : m
              )
            )
          },
          onToken: (tokenText: string) => {
            if (controller.signal.aborted) return
            queueToken(tokenText)
          },
          onToolCall: (toolId, input) => {
            const q =
              input && typeof input === 'object' && 'query' in (input as object)
                ? String((input as { query?: string }).query || '')
                : ''
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      activityState: 'searching' as ActivityState,
                      activityDetail:
                        toolId === 'web_search'
                          ? q
                            ? `Searching: ${q}`
                            : 'Searching the web'
                          : `Using ${toolId}`,
                      toolSummary:
                        toolId === 'web_search' ? 'Searching the web…' : `Running ${toolId}…`,
                    }
                  : m
              )
            )
          },
          onToolResult: (toolId, success, summary) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      toolSummary: summary || (success ? 'Done' : 'Tool failed'),
                      activityState: 'analyzing' as ActivityState,
                      activityDetail: summary || 'Analyzing results',
                    }
                  : m
              )
            )
          },
          onDone: (_messageId, citations) => {
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current)
              flushTimerRef.current = null
            }
            flushTokens()
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      isThinking: false,
                      isStreaming: false,
                      activityState: (m.activityState === 'error'
                        ? 'error'
                        : 'completed') as ActivityState,
                      activityDetail: undefined,
                      toolSummary: undefined,
                      citations: citations && citations.length ? citations : m.citations,
                    }
                  : m
              )
              persistMessages(updated, text)
              return updated
            })
            setIsGenerating(false)
            isGeneratingRef.current = false
            streamMsgIdRef.current = null
            const spoken = streamContentRef.current
            // Voice-originated turns always speak via Sua (force), independent of typed-chat autoSpeak
            if (voiceOrigin && spoken) {
              setLastVoiceReply(spoken)
              void voiceRef.current
                ?.speak(spoken, { force: true })
                .then(() => {
                  if (voiceChatOpenRef.current && !voiceMutedRef.current) {
                    void voiceRef.current?.toggleListen()
                  }
                })
                .catch(() => {
                  /* playback errors already surfaced via controller onError */
                })
            }
            fromVoiceRef.current = false
            setFromVoice(false)
          },
          onError: (_code, message) => {
            sawError = true
            fromVoiceRef.current = false
            setFromVoice(false)
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current)
              flushTimerRef.current = null
            }
            flushTokens()
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      content: m.content || message,
                      isThinking: false,
                      isStreaming: false,
                      activityState: 'error' as ActivityState,
                      activityDetail: undefined,
                    }
                  : m
              )
              persistMessages(updated, text)
              return updated
            })
            setIsGenerating(false)
            isGeneratingRef.current = false
            streamMsgIdRef.current = null
          },
        }
      )

      // Stream ended without done/error (e.g. abort)
      if (controller.signal.aborted) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        flushTokens()
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  isThinking: false,
                  isStreaming: false,
                  activityState: 'completed' as ActivityState,
                }
              : m
          )
          persistMessages(updated, text)
          return updated
        })
        setIsGenerating(false)
        isGeneratingRef.current = false
        streamMsgIdRef.current = null
      } else if (!sawError) {
        // Ensure UI finalized if done event was missed
        setMessages((prev) => {
          const last = prev.find((m) => m.id === streamId)
          if (last && last.isStreaming) {
            const updated = prev.map((m) =>
              m.id === streamId
                ? {
                    ...m,
                    isThinking: false,
                    isStreaming: false,
                    activityState: 'completed' as ActivityState,
                  }
                : m
            )
            persistMessages(updated, text)
            return updated
          }
          return prev
        })
        setIsGenerating(false)
        isGeneratingRef.current = false
        streamMsgIdRef.current = null
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        handleStop()
        return
      }
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === streamId
            ? {
                ...m,
                content: m.content || 'Something went wrong. Please try again.',
                isThinking: false,
                isStreaming: false,
                activityState: 'error' as ActivityState,
              }
            : m
        )
        persistMessages(updated, text)
        return updated
      })
      setIsGenerating(false)
      isGeneratingRef.current = false
      streamMsgIdRef.current = null
      fromVoiceRef.current = false
      setFromVoice(false)
    }
  }

  handleSendRef.current = handleSend

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || isGenerating) return
    setMessages((prev) => {
      const withoutLastNyven = [...prev]
      if (withoutLastNyven[withoutLastNyven.length - 1]?.role === 'nyven') {
        withoutLastNyven.pop()
      }
      return withoutLastNyven
    })
    void handleSend(lastUser.content)
  }

  const deleteConversation = (id: string) => {
    void deleteConversationRemote(userId, id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) startNewChat()
  }

  const renameConversation = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c))
    )
    void (async () => {
      if (!userId) return
      const sb = getSupabase()
      if (!sb) return
      await sb.from('conversations').update({ title }).eq('id', id).eq('user_id', userId)
    })()
  }

  const submitFeedback = async (messageId: string, type: 'positive' | 'negative') => {
    try {
      let accessToken: string | undefined
      if (userId) {
        const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } }
        accessToken = data.session?.access_token
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`
      await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          feedbackType: type,
          conversationId: activeId,
          messageId,
          clientVersion: '1.0.0',
        }),
      })
    } catch {
      /* non-blocking */
    }
  }

  return (
    <div className="h-full flex">
      {/* Desktop history */}
      <aside className="hidden md:flex shrink-0 h-full">
        <ChatHistoryPanel
          variant="desktop"
          conversations={conversations}
          activeId={activeId}
          loading={historyLoading}
          onNew={startNewChat}
          onSelect={(c) => void openConversation(c)}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      </aside>

      {/* Mobile history drawer */}
      {historyOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="relative h-full z-10 shadow-2xl">
            <ChatHistoryPanel
              variant="mobile"
              conversations={conversations}
              activeId={activeId}
              loading={historyLoading}
              onNew={startNewChat}
              onSelect={(c) => void openConversation(c)}
              onDelete={deleteConversation}
              onRename={renameConversation}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="md:hidden flex items-center justify-between px-3 h-12 border-b border-white/[0.05] shrink-0">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="p-2 -ml-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text"
            aria-label="Chat history"
          >
            <History size={20} />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBugOpen(true)}
              className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text"
              aria-label="Report a bug"
            >
              <Bug size={18} />
            </button>
            <button
              type="button"
              onClick={startNewChat}
              className="p-2 -mr-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text"
              aria-label="New chat"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <NIdentity state="white" size={48} className="mb-5 opacity-80" />
                <h2 className="font-display text-xl font-medium mb-2">
                  Start a conversation
                </h2>
                <p className="text-nyven-text-secondary text-sm max-w-sm">
                  Ask anything. Build ideas. Write code. Explore what&apos;s next.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                conversationId={activeId}
                isLast={
                  idx === messages.length - 1 &&
                  msg.role === 'nyven' &&
                  !msg.isThinking &&
                  !msg.isStreaming
                }
                onRegenerate={
                  idx === messages.length - 1 &&
                  msg.role === 'nyven' &&
                  !msg.isStreaming
                    ? handleRegenerate
                    : undefined
                }
                onFeedback={
                  msg.role === 'nyven' && !msg.isStreaming && !msg.isThinking
                    ? submitFeedback
                    : undefined
                }
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Dictation wave lives on the composer mic (MicWaveCircle). Full Liquid Voice is Voice Chat only. */}
        {voiceError && !voiceChatOpen && (
          <p className="text-center text-xs text-red-300 px-4 py-1 max-w-xl mx-auto">{voiceError}</p>
        )}
        <MessageComposer
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={handleStop}
          autoFocus
          onVoiceToggle={() => void voiceRef.current?.toggleListen()}
          voicePhase={voicePhase}
          voiceEnergy={voiceEnergy}
          liquidMode={
            voicePhase === 'speaking'
              ? 'speaking'
              : voicePhase === 'listening'
                ? 'listening'
                : voicePhase === 'transcribing' || isGenerating
                  ? 'thinking'
                  : 'idle'
          }
          onOpenVoiceChat={() => {
            setVoiceChatOpen(true)
            voiceChatOpenRef.current = true
          }}
        />
      </div>

      <VoiceChatScreen
        open={voiceChatOpen}
        onClose={() => {
          setVoiceChatOpen(false)
          voiceChatOpenRef.current = false
          voiceRef.current?.stopAll()
        }}
        voicePhase={voicePhase}
        isProcessing={isGenerating || voicePhase === 'transcribing'}
        isSpeaking={voicePhase === 'speaking'}
        energy={voiceEnergy}
        muted={voiceMuted}
        onToggleMute={() => {
          setVoiceMuted((m) => {
            const next = !m
            voiceMutedRef.current = next
            if (next) voiceRef.current?.stopAll()
            return next
          })
        }}
        onToggleListen={() => {
          if (voiceMuted) return
          void voiceRef.current?.toggleListen()
        }}
        statusHint={voiceError}
        lastTranscript={lastVoiceTranscript}
        lastReply={lastVoiceReply}
      />

      <BugReportModal
        open={bugOpen}
        onClose={() => setBugOpen(false)}
        conversationId={activeId}
      />
    </div>
  )
}