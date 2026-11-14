import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
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

/** "Select text" icon: text lines with a caret bar (no extra icon dependency). */
function SelectTextIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M4 6h10M4 12h7M4 18h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18 5v14M16 5h4M16 19h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function UserMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-xl text-left text-[15px] text-[var(--nyven-text)] hover:bg-[var(--nyven-hover)] active:bg-[var(--nyven-hover)] transition-colors"
    >
      <span className="text-[var(--nyven-text-secondary)] grid place-items-center w-5 shrink-0">{icon}</span>
      {label}
    </button>
  )
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; right: number; origin: 'top' | 'bottom' } | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [editingUser, setEditingUser] = useState(false)
  const [editDraft, setEditDraft] = useState('')

  const userLongPress = useRef<number | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
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

  const openUserMenu = () => {
    if (userMenuOpen || selectMode || !bubbleRef.current) return
    try { navigator.vibrate?.(15) } catch { /* */ }
    setUserMenuPos(null)
    setUserMenuOpen(true)
  }

  const closeUserMenu = () => setUserMenuOpen(false)

  // Anchor the menu directly under the bubble, right-aligned; flip above only when there is no room below.
  useLayoutEffect(() => {
    if (!userMenuOpen) return
    const bubble = bubbleRef.current
    const menu = userMenuRef.current
    if (!bubble || !menu) return
    const r = bubble.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const h = menu.offsetHeight
    const gap = 8
    const edge = 12
    const fitsBelow = r.bottom + gap + h <= vh - edge
    let top = fitsBelow ? r.bottom + gap : r.top - gap - h
    top = Math.min(Math.max(top, edge), Math.max(edge, vh - h - edge))
    setUserMenuPos({ top, right: Math.max(edge, vw - r.right), origin: fitsBelow ? 'top' : 'bottom' })
  }, [userMenuOpen])

  useEffect(() => {
    if (!userMenuOpen) return
    const close = () => setUserMenuOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [userMenuOpen])

  // "Select text": make the bubble selectable, select it, and leave on tap outside / Escape.
  useEffect(() => {
    if (!selectMode) return
    const el = bubbleRef.current
    if (el) {
      try {
        const sel = window.getSelection()
        if (sel) {
          const range = document.createRange()
          range.selectNodeContents(el)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      } catch { /* */ }
    }
    const exit = () => {
      setSelectMode(false)
      try {
        const sel = window.getSelection()
        if (sel && el && sel.anchorNode && el.contains(sel.anchorNode)) sel.removeAllRanges()
      } catch { /* */ }
    }
    const onDown = (e: Event) => {
      if (!el || !el.contains(e.target as Node)) exit()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit()
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [selectMode])

  const copyUserText = async () => {
    closeUserMenu()
    try { await navigator.clipboard.writeText(message.content) } catch { /* */ }
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
              ref={bubbleRef}
              id={`msg-${message.id}`}
              className={`bg-nyven-surface border rounded-2xl rounded-br-md px-4 py-3 text-[0.9375rem] leading-relaxed text-nyven-text break-words transition-[transform,box-shadow,border-color] duration-150 ${
                selectMode
                  ? 'select-text border-[var(--nyven-border)]'
                  : '[@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none] border-[var(--nyven-border)]'
              } ${userMenuOpen ? 'ring-2 ring-nyven-cyan/40 scale-[0.985]' : ''}`}
              onContextMenu={(e) => {
                if (selectMode) return
                e.preventDefault()
                openUserMenu()
              }}
              onTouchStart={() => {
                if (selectMode) return
                if (userLongPress.current) window.clearTimeout(userLongPress.current)
                userLongPress.current = window.setTimeout(openUserMenu, 450)
              }}
              onTouchEnd={() => { if (userLongPress.current) window.clearTimeout(userLongPress.current) }}
              onTouchMove={() => { if (userLongPress.current) window.clearTimeout(userLongPress.current) }}
              onTouchCancel={() => { if (userLongPress.current) window.clearTimeout(userLongPress.current) }}
            >
              {message.content}
            </div>
          ) : null}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {userMenuOpen && (
              <button
                type="button"
                className="fixed inset-0 z-[90] cursor-default"
                aria-label="Close menu"
                onClick={closeUserMenu}
              />
            )}
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  key="user-msg-menu"
                  ref={userMenuRef}
                  role="menu"
                  aria-label="Message actions"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{
                    position: 'fixed',
                    top: userMenuPos?.top ?? 0,
                    right: userMenuPos?.right ?? 12,
                    transformOrigin: userMenuPos?.origin === 'bottom' ? 'bottom right' : 'top right',
                  }}
                  className="z-[91] w-[232px] max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/95 backdrop-blur-xl shadow-lg shadow-nyven-shade/60 p-1.5"
                >
                  <p className="px-3 pt-1.5 pb-2 text-[12px] text-[var(--nyven-text-secondary)] border-b border-[var(--nyven-border)] mb-1">
                    {timeLabel}
                  </p>
                  <UserMenuItem icon={<Copy size={18} />} label="Copy" onClick={() => void copyUserText()} />
                  <UserMenuItem
                    icon={<SelectTextIcon />}
                    label="Select text"
                    onClick={() => {
                      closeUserMenu()
                      setSelectMode(true)
                    }}
                  />
                  <UserMenuItem
                    icon={<Pencil size={18} />}
                    label="Edit message"
                    onClick={() => {
                      closeUserMenu()
                      setEditDraft(message.content)
                      setEditingUser(true)
                    }}
                  />
                  <UserMenuItem
                    icon={<Share2 size={18} />}
                    label="Share prompt"
                    onClick={() => {
                      closeUserMenu()
                      void handleShare()
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>,
          document.body
        )}

      {editingUser && (
        <div className="fixed inset-0 z-[91] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Edit message">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" aria-label="Close" onClick={() => setEditingUser(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] p-4 shadow-2xl">
            <p className="text-sm text-[var(--nyven-text-secondary)] mb-2">Edit message</p>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="w-full min-h-[120px] rounded-xl bg-[var(--nyven-bg)] border border-[var(--nyven-border)] text-[var(--nyven-text)] p-3 text-[0.9375rem] outline-none focus:border-nyven-cyan/40 resize-y"
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button type="button" className="flex-1 h-11 rounded-xl border border-[var(--nyven-border)] text-[var(--nyven-text-secondary)]" onClick={() => setEditingUser(false)}>Cancel</button>
              <button
                type="button"
                disabled={!editDraft.trim()}
                className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[var(--nyven-on-accent)] font-semibold disabled:opacity-50"
                onClick={() => {
                  const text = editDraft.trim()
                  if (!text) return
                  setEditingUser(false)
                  onEdit?.(text)
                }}
              >
                Send
              </button>
            </div>
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
                    ? 'text-nyven-cyan drop-shadow-[0_0_8px_var(--nyven-glow-strong)]'
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
          <div className="absolute left-0 right-0 bottom-0 rounded-t-[24px] border-t border-[var(--nyven-border)] bg-nyven-surface/95 backdrop-blur-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
