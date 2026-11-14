import { ChevronDown, Menu } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { ChatThread } from '../components/chat/ChatThread'
import { ChatFloatingChrome } from '../components/chat/ChatFloatingChrome'
import { PrivateChatIcon } from '../components/PrivateChatIcon'
import { recordChatTurnForInstall } from '../lib/pwa'
import { extractNyvenFiles } from '../lib/parseNyvenFiles'
import { hydrateMessageFiles } from '../lib/hydrateMessageFiles'
import { useReadAloud } from '../hooks/useReadAloud'
import { MessageComposer, type ComposerSendPayload } from '../components/MessageComposer'
import { NIdentity } from '../components/NIdentity'
import { useHideOnScroll } from '../hooks/useHideOnScroll'
import { useChatScroll } from '../hooks/useChatScroll'
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
import { extractMemoriesFromExchange } from '../lib/memoryStore'
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
  const [composerPad, setComposerPad] = useState(96)
  const composerWrapRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamMsgIdRef = useRef<string | null>(null)
  const tokenBufferRef = useRef('')
  const streamContentRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatScroll = useChatScroll()
  const {
    stickToBottomRef,
    showJumpLatest,
    setShowJumpLatest,
    bottomRef,
    scrollRef,
    scrollToBottom,
    onChatScroll,
  } = chatScroll
  const hideHeader = useHideOnScroll(24)
  const readAloud = useReadAloud()
  const [privateMode, setPrivateMode] = useState(false)
  const privateModeRef = useRef(false)
  useEffect(() => { privateModeRef.current = privateMode }, [privateMode])


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
    const newId = contextNewChat(); setPrivateMode(false)
    activeIdRef.current = newId
    setMessages([])
    void handleSendRef.current(msg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Messages are a function of activeId.
  useEffect(() => {
    if (skipNextActiveLoadRef.current) {
      skipNextActiveLoadRef.current = false
      return
    }
    let cancelled = false
    const abortInFlight = () => {
      voiceRef.current?.stopAll()
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
      tokenBufferRef.current = ''
      streamContentRef.current = ''
      streamMsgIdRef.current = null
      setIsGenerating(false)
      isGeneratingRef.current = false
      fromVoiceRef.current = false
      voiceSubmitInFlightRef.current = false
      setFromVoice(false)
      setReadingMessageId(null)
      setReadAloudLoading(false)
      stickToBottomRef.current = true
      setShowJumpLatest(false)
    }
    void (async () => {
      const fromList = conversations.find((c) => c.id === activeId)
      if (fromList?.messages?.length) {
        abortInFlight()
        if (!cancelled) setMessages(hydrateMessageFiles(fromList.messages))
        return
      }
      if (!fromList) {
        abortInFlight()
        if (!cancelled) setMessages([])
        return
      }
      abortInFlight()
      const msgs = await loadConversationMessages(userId, activeId)
      if (!cancelled) setMessages(hydrateMessageFiles(msgs))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, userId])



  const openConversation = async (c: Conversation) => {
    contextOpenConversation(c)
    if (c.messages?.length) {
      setMessages(hydrateMessageFiles(c.messages))
    } else {
      const msgs = await loadConversationMessages(userId, c.id)
      setMessages(hydrateMessageFiles(msgs))
    }
    setTimeout(() => scrollToBottom(true, true), 50)
  }


  const persistMessages = useCallback(
    (updated: Message[], titleSource?: string) => {
      // Private chats: never write history or durable messages
      if (privateModeRef.current) return

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
    recordChatTurnForInstall()
    setIsGenerating(true)
    isGeneratingRef.current = true
    scrollToBottom()
    void recordUsage(userId, 'message')
    if (!privateMode) {
      void ensureConversation(userId, convId, text.slice(0, 40) || 'Chat')
      void persistMessage(userId, convId, userMsg, text.slice(0, 40))
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    let sawError = false

    try {
      // Auth: the HttpOnly `nyven_session` cookie is sent automatically by
      // streamCoreChat (credentials: 'include'); no client-side token is needed.
      const coreMessage = text || 'Please analyze the attached content.'
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
            const rawFinal = streamContentRef.current || ''
            void (async () => {
              let finalContent = rawFinal
              let files: import('../lib/types').Message['files'] = undefined
              try {
                const parsed = await extractNyvenFiles(rawFinal)
                if (parsed.files.length) {
                  finalContent = parsed.content || rawFinal
                  files = parsed.files
                  streamContentRef.current = finalContent
                }
              } catch {
                /* keep raw */
              }
              setMessages((prev) => {
                const updated = prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        content: finalContent || m.content,
                        files: files?.length ? files : m.files,
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
            })()
            // isGenerating cleared in async path; keep early false for responsiveness
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
            if (!privateModeRef.current) void extractMemoriesFromExchange(userId, text, streamContentRef.current, {
              conversationId: activeIdRef.current,
            })
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

  const handleEditUser = (messageId: string, newText: string) => {
    // Drop the edited user message and everything after; resend
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId)
      if (idx < 0) return prev
      return prev.slice(0, idx)
    })
    void handleSend({ text: newText, attachments: [] })
  }

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
        <header
          className={`lg:hidden relative flex items-center gap-2 px-2 h-12 shrink-0 bg-transparent transition-transform duration-200 ${
            hideHeader.hidden ? '-translate-y-full opacity-0 pointer-events-none' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('nyven-open-menu'))}
            className="relative p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text min-h-[48px] min-w-[48px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={28} />
          </button>
          {messages.length > 0 && (
            <h1 className="flex-1 text-center text-[15px] font-medium truncate pr-11 text-nyven-text">
              {messages.find((m) => m.role === 'user')?.content?.slice(0, 48) || 'Chat'}
            </h1>
          )}
          {messages.length === 0 && (
            <>
              <div className="flex-1" />
              <PrivateChatIcon active={privateMode} onToggle={() => setPrivateMode((v) => !v)} size={34} />
            </>
          )}
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 min-h-0 min-w-0" style={{ paddingBottom: composerPad }} onScroll={(e) => { onChatScroll(e); hideHeader.onScroll(e) }}>
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !privateMode && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 sm:py-24 text-center px-4">
                <NIdentity state="white" size={56} className="mb-6 opacity-90 drop-shadow-[0_0_24px_var(--nyven-glow-strong)]" />
                <h2 className="font-display text-2xl sm:text-[1.75rem] font-medium text-nyven-text mb-3">
                  {timeGreeting(firstName)}
                </h2>
                <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm">
                  {[
                    { label: 'Ask', path: null, text: 'Explain a concept simply' },
                    { label: 'Build', path: '/build', text: null },
                    { label: 'Create', path: null, text: 'Help me draft something creative' },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      className="px-3.5 py-2 rounded-full border border-[var(--nyven-border)] bg-[var(--nyven-input-bg)] text-sm text-nyven-text-secondary hover:text-nyven-text hover:border-nyven-cyan/30 min-h-[40px]"
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

            {messages.length === 0 && privateMode && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 px-6 text-center">
                <div className="mb-4 text-[var(--nyven-cyan)] pointer-events-none" aria-hidden>
                  <PrivateChatIcon active size={56} onToggle={() => {}} className="pointer-events-none w-16 h-16" />
                </div>
                <p className="text-[1.125rem] font-medium text-[var(--nyven-text)]">Private chat</p>
                <p className="text-[0.875rem] text-[var(--nyven-text-secondary)] mt-2 max-w-xs leading-relaxed">
                  This chat won't be saved to your history or Nyven's memory.
                </p>
              </div>
            )}

            {messages.length > 0 && (
              <ChatThread
                messages={messages}
                isGenerating={isGenerating}
                conversationId={activeId}
                onFeedback={(messageId, rating, note) => {
                  void submitFeedback(messageId, rating)
                }}
                onReadAloud={(id, content) => readAloud.play(id, content)}
                onStopReadAloud={readAloud.stop}
                readingMessageId={readAloud.state.messageId}
                readAloudLoading={readAloud.state.loading}
                onRegenerate={handleRegenerate}
                onEditUser={handleEditUser}
                listOnly
                className="contents"
              />
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Dictation wave lives on the composer mic (MicWaveCircle). Full Liquid Voice is Voice Chat only. */}
        {voiceError && !voiceChatOpen && (
          <p className="text-center text-xs text-red-300 px-4 py-1 max-w-xl mx-auto">{voiceError}</p>
        )}
        <div ref={composerWrapRef} className="relative shrink-0 w-full max-w-3xl mx-auto px-0 sm:px-4 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] min-w-0">
          <ChatFloatingChrome
            showJump={showJumpLatest}
            onJump={() => {
              stickToBottomRef.current = true
              scrollToBottom(true, true)
            }}
            readAloud={readAloud}
          />
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