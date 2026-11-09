import { ChevronDown, Menu } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { ChatMessage } from '../components/ChatMessage'
import { MessageComposer, type ComposerSendPayload } from '../components/MessageComposer'
import { NIdentity } from '../components/NIdentity'
import { VoiceChatScreen } from '../components/voice/VoiceChatScreen'
import type { Message, Conversation } from '../lib/types'
import { streamCoreChat } from '../lib/core/streamClient'
import type { ActivityState } from '../lib/core/types'
import { VoiceController, type VoicePhase } from '../lib/voice/controller'
import { getVoicePreferences } from '../lib/voice/preferences'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
import { useAuth } from '../lib/auth/AuthContext'
import {
  loadConversationMessages,
  ensureConversation,
  persistMessage,
} from '../lib/chatPersistence'
import { buildMemoryContext } from '../lib/memoryStore'
import { recordUsage } from '../lib/usageTracking'



function timeGreeting(firstName: string | null): string {
  const h = new Date().getHours()
  const name = firstName?.trim()
  if (!name) return 'Hello'
  if (h >= 5 && h <= 11) return `Good morning, ${name}`
  if (h >= 12 && h <= 16) return `Good afternoon, ${name}`
  if (h >= 17 && h <= 21) return `Good evening, ${name}`
  return `Hello, ${name}`
}

export function Chat() {
  const { user, profile } = useAuth()
  const firstName =
    (profile?.display_name || user?.displayName || '')
      .trim()
      .split(/\s+/)[0] || null
  const location = useLocation()
  const userId = user?.id ?? null
  const {
    conversations,
    activeId,
    setActiveId,
    startNewChat: contextNewChat,
    openConversation: contextOpenConversation,
    deleteConversation: contextDeleteConversation,
    renameConversation: contextRenameConversation,
    upsertConversationMeta,
    refresh: refreshConversations,
  } = useConversationHistory()

  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [readingMessageId, setReadingMessageId] = useState<string | null>(null)
  const [readAloudLoading, setReadAloudLoading] = useState(false)
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
  const skipNextActiveLoadRef = useRef(false)
  const isGeneratingRef = useRef(isGenerating)
  isGeneratingRef.current = isGenerating

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  /** Voice-originated turn — ref so stream onDone sees the real flag */
  const fromVoiceRef = useRef(false)
  const voiceSubmitInFlightRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const [showJumpLatest, setShowJumpLatest] = useState(false)
  const [composerPad, setComposerPad] = useState(96)
  const composerWrapRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamMsgIdRef = useRef<string | null>(null)
  const tokenBufferRef = useRef('')
  const streamContentRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback((force = false, smooth = false) => {
    if (!force && !stickToBottomRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    setShowJumpLatest(false)
  }, [])

  const onChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = dist < 120
    stickToBottomRef.current = nearBottom
    setShowJumpLatest(!nearBottom && el.scrollHeight > el.clientHeight + 40)
  }, [])


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
        if (!text.trim()) return
        // One accepted transcript → one Core submission
        if (voiceSubmitInFlightRef.current || isGeneratingRef.current) {
          console.warn('[nyven-voice] skipped duplicate/overlapping transcript submit')
          return
        }
        fromVoiceRef.current = true
        voiceSubmitInFlightRef.current = true
        setFromVoice(true)
        setLastVoiceTranscript(text)
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

  // Home / quick-action handoff: submit via latest handleSendRef (never a stale closure).
  // Runs once on mount; must NOT race with the activeId loader clearing messages.
  useEffect(() => {
    const state = location.state as { initialMessage?: string; newChat?: boolean } | null
    const msg = state?.initialMessage?.trim()
    if (!msg) return
    window.history.replaceState({}, '')
    // Fresh conversation for Home; set activeIdRef immediately so handleSend uses it
    skipNextActiveLoadRef.current = true
    const newId = contextNewChat()
    activeIdRef.current = newId
    setMessages([])
    void handleSendRef.current(msg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync messages when the user selects a conversation in the sidebar.
  // Do NOT clear messages for brand-new conversation ids (Home initialMessage / New Chat).
  // Clearing here previously raced Home submit and wiped the in-flight user+assistant rows.
  useEffect(() => {
    if (skipNextActiveLoadRef.current) {
      skipNextActiveLoadRef.current = false
      return
    }
    let cancelled = false
    void (async () => {
      const fromList = conversations.find((c) => c.id === activeId)
      if (fromList?.messages?.length) {
        if (!cancelled) setMessages(fromList.messages)
        return
      }
      if (!fromList) {
        // Brand-new conversation id (New Chat / after delete) — always blank canvas
        if (!cancelled) setMessages([])
        return
      }
      const msgs = await loadConversationMessages(userId, activeId)
      if (!cancelled) setMessages(msgs)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, userId])

  const startNewChat = () => {
    skipNextActiveLoadRef.current = true
    const newId = contextNewChat()
    activeIdRef.current = newId
    setMessages([])
  }


  const openConversation = async (c: Conversation) => {
    contextOpenConversation(c)
    if (c.messages?.length) {
      setMessages(c.messages)
    } else {
      const msgs = await loadConversationMessages(userId, c.id)
      setMessages(msgs)
    }
    setTimeout(() => scrollToBottom(true, true), 50)
  }


  const persistMessages = useCallback(
    (updated: Message[], titleSource?: string) => {
      const titleBase =
        titleSource || updated.find((m) => m.role === 'user')?.content || 'Chat'
      const title =
        titleBase.slice(0, 40) + (titleBase.length > 40 ? '…' : '')

      upsertConversationMeta(activeId, {
        title: title || 'Chat',
        messages: updated,
        updatedAt: Date.now(),
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
    voiceSubmitInFlightRef.current = false
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
        previewDataUrl:
          a.kind === 'image' && a.inlineBase64
            ? `data:${a.mimeType};base64,${a.inlineBase64}`
            : undefined,
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
      // Auth: the HttpOnly `nyven_session` cookie is sent automatically by
      // streamCoreChat (credentials: 'include'); no client-side token is needed.
      const memoryCtx = await buildMemoryContext(userId)
      const coreMessage = [memoryCtx, text || 'Please analyze the attached content.']
        .filter(Boolean)
        .join('\n\n')
      await streamCoreChat(
        {
          message: coreMessage,
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
              void (async () => {
                try {
                  await voiceRef.current?.speak(spoken, { force: true })
                  // Only auto-reopen mic after playback fully ends
                  if (voiceChatOpenRef.current && !voiceMutedRef.current) {
                    void voiceRef.current?.toggleListen()
                  }
                } catch {
                  /* TTS/playback error already reported via controller; do not reopen mic */
                }
              })()
            }
            fromVoiceRef.current = false
            voiceSubmitInFlightRef.current = false
            setFromVoice(false)
          },
          onError: (_code, message) => {
            sawError = true
            fromVoiceRef.current = false
            voiceSubmitInFlightRef.current = false
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



  const stopReadAloud = () => {
    voiceRef.current?.stopSpeaking()
    setReadingMessageId(null)
    setReadAloudLoading(false)
  }

  const handleReadAloud = async (messageId: string, content: string) => {
    if (!content.trim()) return
    // Toggle off if same message
    if (readingMessageId === messageId) {
      stopReadAloud()
      return
    }
    // Stop any current speech (voice chat or previous read-aloud) first
    voiceRef.current?.stopSpeaking()
    setReadingMessageId(messageId)
    setReadAloudLoading(true)
    try {
      // Unlock audio from this user gesture
      voiceRef.current?.prepareAudio()
      setReadAloudLoading(false)
      // force: use Sua regardless of typed-chat autoSpeak; does NOT open mic
      await voiceRef.current?.speak(content, { force: true })
    } catch {
      // Error already shown via voice onError
    } finally {
      setReadingMessageId(null)
      setReadAloudLoading(false)
    }
  }

  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)

  const submitFeedback = async (messageId: string, type: 'positive' | 'negative') => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          feedbackType: type,
          conversationId: activeId,
          messageId,
          clientVersion: '1.0.0',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
      if (res.ok && data.success) {
        setFeedbackToast(data.message || 'Thank you for your feedback!')
        window.setTimeout(() => setFeedbackToast(null), 3500)
      }
    } catch {
      /* non-blocking */
    }
  }

  useEffect(() => {
    const el = composerWrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height
      if (typeof h === 'number' && h > 0) setComposerPad(Math.ceil(h) + 8)
    })
    ro.observe(el)
    setComposerPad(el.offsetHeight + 8)
    return () => ro.disconnect()
  }, [messages.length, isGenerating])

  return (
    <div className="h-full flex relative">
            {!online && (
        <div
          role="status"
          className="absolute top-0 inset-x-0 z-40 px-3 py-2 text-center text-xs sm:text-sm bg-amber-500/15 text-amber-100 border-b border-amber-500/20"
        >
          You appear to be offline. Messages may not send until connection returns.
        </div>
      )}

      {feedbackToast && (
        <div
          role="status"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-nyven-surface border border-nyven-cyan/30 text-sm text-nyven-text shadow-lg"
        >
          {feedbackToast}
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 max-w-full relative">
        {/* Mobile chat top bar — hamburger only, title when chat has messages */}
        <header className="lg:hidden flex items-center gap-2 px-2 h-12 shrink-0 bg-transparent">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('nyven-open-menu'))}
            className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          {messages.length > 0 && (
            <h1 className="flex-1 text-center text-[15px] font-medium truncate pr-11 text-nyven-text">
              {messages.find((m) => m.role === 'user')?.content?.slice(0, 48) || 'Chat'}
            </h1>
          )}
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 min-h-0 min-w-0" style={{ paddingBottom: composerPad }} onScroll={onChatScroll}>
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 sm:py-24 text-center px-4">
                <NIdentity state="white" size={56} className="mb-6 opacity-90 drop-shadow-[0_0_24px_rgba(98,230,255,0.25)]" />
                <h2 className="font-display text-2xl sm:text-[1.75rem] font-medium text-nyven-text mb-3">
                  {timeGreeting(firstName)}
                </h2>
                <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm">
                  {[
                    { label: 'Ask', path: null, text: 'Explain a concept simply' },
                    { label: 'Build', path: '/build', text: null },
                    { label: 'Create', path: null, text: 'Help me draft something creative' },
                    { label: 'Code', path: '/code', text: null },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      className="px-3.5 py-2 rounded-full border border-white/10 bg-white/[0.04] text-sm text-nyven-text-secondary hover:text-nyven-text hover:border-nyven-cyan/30 min-h-[40px]"
                      onClick={() => {
                        if (chip.path) window.location.assign(chip.path)
                        else if (chip.text)
                          void handleSend({ text: chip.text, attachments: [] })
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
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
                onReadAloud={
                  msg.role === 'nyven' && !msg.isStreaming && !msg.isThinking
                    ? handleReadAloud
                    : undefined
                }
                onStopReadAloud={stopReadAloud}
                isReadingAloud={
                  readingMessageId === msg.id && !readAloudLoading
                }
                isReadAloudLoading={
                  readingMessageId === msg.id && readAloudLoading
                }
              />
            ))}
            
            {messages.length > 0 &&
              messages[messages.length - 1]?.role === 'nyven' &&
              messages[messages.length - 1]?.activityState === 'error' &&
              !isGenerating && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <p className="text-sm text-nyven-text-secondary text-center">
                    Something went wrong while generating the response.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleRegenerate()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-nyven-surface border border-white/10 text-sm font-medium text-nyven-text hover:border-nyven-cyan/40"
                  >
                    Retry
                  </button>
                </div>
              )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Dictation wave lives on the composer mic (MicWaveCircle). Full Liquid Voice is Voice Chat only. */}
        {voiceError && !voiceChatOpen && (
          <p className="text-center text-xs text-red-300 px-4 py-1 max-w-xl mx-auto">{voiceError}</p>
        )}
        <div ref={composerWrapRef} className="relative shrink-0 w-full max-w-3xl mx-auto px-0 sm:px-4 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] min-w-0">
          {showJumpLatest && (
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-20">
              <button
                type="button"
                onClick={() => {
                  stickToBottomRef.current = true
                  scrollToBottom(true, true)
                }}
                className="pointer-events-auto inline-flex items-center justify-center w-10 h-10 rounded-full bg-nyven-surface/90 backdrop-blur-md border border-white/10 text-nyven-text shadow-lg shadow-black/30 hover:border-nyven-cyan/40 hover:text-nyven-cyan transition-colors"
                aria-label="Jump to latest"
                title="Jump to latest"
              >
                <ChevronDown size={20} strokeWidth={2} />
              </button>
            </div>
          )}
          <MessageComposer
            onSend={handleSend}
            isGenerating={isGenerating}
            onStop={handleStop}
            autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
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
          <p className="text-center text-[11px] text-nyven-text-secondary/80 mt-2 px-2 leading-snug">
            Nyven can make mistakes. Check important information.
          </p>
        </div>
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
    </div>
  )
}