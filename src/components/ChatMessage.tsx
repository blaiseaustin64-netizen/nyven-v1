import { useState } from 'react'
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
} from 'lucide-react'
import { ActivityIndicator } from './ActivityIndicator'
import { StreamingRevealText } from './StreamingRevealText'
import type { Message } from '../lib/types'
import type { ActivityState } from '../lib/core/types'

interface ChatMessageProps {
  message: Message
  onRegenerate?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isLast?: boolean
  conversationId?: string
  onFeedback?: (
    messageId: string,
    rating: 'positive' | 'negative',
    note?: string
  ) => void
}

/** Single activity line — only when no content yet (no logo / N branding) */
function shouldShowActivity(message: Message): boolean {
  if (message.content) return false
  if (!message.isThinking && !message.isStreaming) return false
  const s = message.activityState
  if (!s || s === 'completed' || s === 'error' || s === 'idle') return false
  return true
}

export function ChatMessage({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  isLast,
  conversationId,
  onFeedback,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null)
  const isUser = message.role === 'user'
  const active = Boolean(message.isThinking || message.isStreaming)
  const showActivity = shouldShowActivity(message)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (isUser) {
    return (
      <div className="flex justify-end group">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed text-nyven-text">
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {message.attachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg bg-white/[0.06] text-nyven-text-secondary max-w-[180px] truncate"
                    title={a.name}
                  >
                    {a.kind === 'image' ? (
                      <ImageIcon size={12} className="shrink-0" />
                    ) : (
                      <FileText size={12} className="shrink-0" />
                    )}
                    <span className="truncate">{a.name}</span>
                  </span>
                ))}
              </div>
            )}
            {message.content}
          </div>
          <div className="flex justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
                aria-label="Edit message"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Assistant — no N logo / NYVEN heading during thinking
  return (
    <div className="group pl-0.5">
      <div className="min-w-0 max-w-3xl">
        {showActivity ? (
          <ActivityIndicator
            state={message.activityState as ActivityState}
            detail={
              // Prefer short label over long tool dumps for shimmer
              message.activityDetail && message.activityDetail.length < 48
                ? message.activityDetail
                : undefined
            }
          />
        ) : message.content ? (
          <StreamingRevealText
            content={message.content}
            isStreaming={Boolean(message.isStreaming)}
          />
        ) : null}

        {!active && message.content && (
          <div className="flex flex-wrap items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
              aria-label="Copy"
            >
              {copied ? <Check size={14} className="text-nyven-cyan" /> : <Copy size={14} />}
            </button>
            {isLast && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="p-1.5 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
                aria-label="Regenerate"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="p-1.5 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
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
                  className={`p-1.5 rounded-lg hover:bg-white/[0.05] ${
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
                  className={`p-1.5 rounded-lg hover:bg-white/[0.05] ${
                    feedback === 'negative' ? 'text-red-300' : 'text-nyven-text-secondary'
                  }`}
                  aria-label="Not helpful"
                >
                  <ThumbsDown size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
