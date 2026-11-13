import { useState, useRef } from 'react'
import {
  Copy,
  Check,
  RotateCcw,
  Pencil,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Image as ImageIcon,
  Share2,
  Volume2,
  Square,
  Loader2,
} from 'lucide-react'
import { ActivityIndicator } from './ActivityIndicator'
import { MessageContent } from './markdown/MessageContent'
import type { Message } from '../lib/types'
import type { ActivityState } from '../lib/core/types'

interface ChatMessageProps {
  message: Message
  onRegenerate?: () => void
  onEdit?: (newText?: string) => void
  onDelete?: () => void
  isLast?: boolean
  conversationId?: string
  onFeedback?: (
    messageId: string,
    rating: 'positive' | 'negative',
    note?: string
  ) => void
  /** Read Aloud — real Sua TTS via parent */
  onReadAloud?: (messageId: string, content: string) => void
  onStopReadAloud?: () => void
  isReadingAloud?: boolean
  isReadAloudLoading?: boolean
}

function shouldShowActivity(message: Message): boolean {
  if (message.content) return false
  if (!message.isThinking && !message.isStreaming) return false
  const s = message.activityState
  if (!s || s === 'completed' || s === 'error' || s === 'idle') return false
  return true
}

async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const payload = text.trim()
  if (!payload) return 'failed'
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text: payload })
      return 'shared'
    }
  } catch (e: unknown) {
    // User cancel
    if ((e as { name?: string })?.name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(payload)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function ChatMessage({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  isLast,
  conversationId,
  onFeedback,
  onReadAloud,
  onStopReadAloud,
  isReadingAloud,
  isReadAloudLoading,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [userSheetOpen, setUserSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(false)
  const [editDraft, setEditDraft] = useState('')

  const userLongPress = useRef<number | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const isUser = message.role === 'user'
  const active = Boolean(message.isThinking || message.isStreaming)
  const showActivity = shouldShowActivity(message)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleShare = async () => {
    const result = await shareText(message.content)
    if (result === 'shared') setShareHint('Shared')
    else if (result === 'copied') setShareHint('Copied')
    else setShareHint('Could not share')
    setTimeout(() => setShareHint(null), 2000)
  }

  if (isUser) {
    // Attachments render once in ChatThread above this bubble — not inside it.
    const ts = new Date(message.timestamp || Date.now())
    const timeLabel = ts.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    return (
      <>
      <div className="flex justify-end group">
        <div className="max-w-[85%] sm:max-w-[75%] min-w-0">
          {message.content ? (
            <div
              className="bg-nyven-surface border border-[var(--nyven-border)] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed text-nyven-text break-words"
              onContextMenu={(e) => { e.preventDefault(); setUserSheetOpen(true) }}
              onTouchStart={() => {
                userLongPress.current = window.setTimeout(() => {
                  try { navigator.vibrate?.(15) } catch {}
                  setUserSheetOpen(true)
                }, 450)
              }}
              onTouchEnd={() => { if (userLongPress.current) window.clearTimeout(userLongPress.current) }}
              onTouchMove={() => { if (userLongPress.current) window.clearTimeout(userLongPress.current) }}
            >
              {message.content}
            </div>
          ) : null}
          <div className="flex justify-end gap-1 mt-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Edit message"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      {editingUser && (
        <div className="fixed inset-0 z-[91] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" aria-label="Close" onClick={() => setEditingUser(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] p-4 shadow-2xl">
            <p className="text-sm text-[var(--nyven-text-secondary)] mb-2">Edit text</p>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="w-full min-h-[120px] rounded-xl bg-[var(--nyven-bg)] border border-[var(--nyven-border)] text-[var(--nyven-text)] p-3 text-[0.9375rem] outline-none resize-y"
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button type="button" className="flex-1 h-11 rounded-xl border border-[var(--nyven-border)] text-[var(--nyven-text-secondary)]" onClick={() => setEditingUser(false)}>Cancel</button>
              <button type="button" className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[var(--nyven-on-accent)] font-semibold" onClick={() => {
                setEditingUser(false)
                onEdit?.(editDraft.trim())
              }}>Send</button>
            </div>
          </div>
        </div>
      )}
      {userSheetOpen && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" aria-label="Close" onClick={() => setUserSheetOpen(false)} />
          <div className="absolute left-3 right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)]/95 backdrop-blur-xl shadow-2xl p-2">
            <p className="text-[12px] text-[var(--nyven-text-secondary)] px-3 py-2">{timeLabel}</p>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-[var(--nyven-text)] hover:bg-[var(--nyven-surface)]" onClick={() => { void navigator.clipboard.writeText(message.content); setUserSheetOpen(false) }}>
              <Copy size={18} /> Copy
            </button>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-[var(--nyven-text)] hover:bg-[var(--nyven-surface)]" onClick={() => {
              setEditDraft(message.content)
              setEditingUser(true)
              setUserSheetOpen(false)
            }}>
              <Pencil size={18} /> Edit text
            </button>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-[var(--nyven-text)] hover:bg-[var(--nyven-surface)]" onClick={() => { void handleShare(); setUserSheetOpen(false) }}>
              <Share2 size={18} /> Share prompt
            </button>
          </div>
        </div>
      )}
      </>
    )
  }

  return (
    <>
    <div className="group pl-0.5 min-w-0">
      <div className="min-w-0 max-w-3xl">
        {showActivity ? (
          <ActivityIndicator
            state={message.activityState as ActivityState}
            detail={
              message.activityDetail && message.activityDetail.length < 48
                ? message.activityDetail
                : undefined
            }
          />
        ) : message.content ? (
          <div
            onContextMenu={(e) => {
              e.preventDefault()
              if (!active) setSheetOpen(true)
            }}
            onTouchStart={() => {
              if (active) return
              longPressTimer.current = window.setTimeout(() => setSheetOpen(true), 500)
            }}
            onTouchEnd={() => {
              if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
            }}
            onTouchMove={() => {
              if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
            }}
          >
            <MessageContent content={message.content} isStreaming={Boolean(message.isStreaming)} />
          </div>
        ) : null}

        {!active && message.content && (
          <div className={`flex flex-wrap items-center gap-0.5 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity ${
            isReadingAloud || isReadAloudLoading ? 'sm:opacity-100' : ''
          }`}>
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Copy"
            >
              {copied ? <Check size={14} className="text-nyven-cyan" /> : <Copy size={14} />}
            </button>
            {isLast && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Regenerate"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
            {onFeedback && conversationId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback('positive')
                    onFeedback(message.id, 'positive')
                  }}
                  className={`p-2 rounded-lg hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center ${
                    feedback === 'positive' ? 'text-nyven-cyan' : 'text-nyven-text-secondary'
                  }`}
                  aria-label="Helpful"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback('negative')
                    onFeedback(message.id, 'negative')
                  }}
                  className={`p-2 rounded-lg hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center ${
                    feedback === 'negative' ? 'text-red-300' : 'text-nyven-text-secondary'
                  }`}
                  aria-label="Not helpful"
                >
                  <ThumbsDown size={14} />
                </button>
              </>
            )}

            {/* Share */}
            <button
              type="button"
              onClick={() => void handleShare()}
              className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Share response"
              title={shareHint || 'Share'}
            >
              <Share2 size={14} />
            </button>
            {shareHint && (
              <span className="text-[11px] text-nyven-text-secondary px-1">{shareHint}</span>
            )}

            {/* Read Aloud — Sua via parent voice controller */}
            {onReadAloud && (
              <button
                type="button"
                onClick={() => {
                  if (isReadingAloud || isReadAloudLoading) {
                    onStopReadAloud?.()
                  } else {
                    onReadAloud(message.id, message.content)
                  }
                }}
                className={`p-2 rounded-lg hover:bg-[var(--nyven-surface)] min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors ${
                  isReadingAloud || isReadAloudLoading
                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]'
                    : 'text-nyven-text-secondary hover:text-nyven-text'
                }`}
                aria-label={
                  isReadAloudLoading
                    ? 'Preparing audio'
                    : isReadingAloud
                      ? 'Stop reading'
                      : 'Read aloud'
                }
                title={
                  isReadAloudLoading
                    ? 'Preparing…'
                    : isReadingAloud
                      ? 'Stop reading'
                      : 'Read aloud'
                }
              >
                {isReadAloudLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isReadingAloud ? (
                  <Square size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" aria-label="Close" onClick={() => setSheetOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 rounded-t-[24px] border-t border-[var(--nyven-border)] bg-[var(--nyven-surface)]/95 backdrop-blur-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 rounded-full bg-[var(--nyven-surface)] mx-auto mb-4" />
            <p className="text-sm text-nyven-text-secondary mb-3 text-center">Message actions</p>
            <div className="space-y-1">
              <button type="button" className="w-full min-h-[48px] rounded-xl text-left px-4 text-nyven-text active:bg-nyven-cyan/10" onClick={() => { void handleCopy(); setSheetOpen(false) }}>Copy</button>
              {onRegenerate && (
                <button type="button" className="w-full min-h-[48px] rounded-xl text-left px-4 text-nyven-text active:bg-nyven-cyan/10" onClick={() => { onRegenerate(); setSheetOpen(false) }}>Regenerate</button>
              )}
              <button type="button" className="w-full min-h-[48px] rounded-xl text-left px-4 text-nyven-text active:bg-nyven-cyan/10" onClick={() => { void handleShare(); setSheetOpen(false) }}>Share</button>
              <button type="button" className="w-full min-h-[48px] rounded-xl text-left px-4 text-nyven-text-secondary" onClick={() => setSheetOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
