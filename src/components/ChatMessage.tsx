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
import { NIdentity, type NState } from './NIdentity'
import { ActivityIndicator } from './ActivityIndicator'
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

function nStateFor(message: Message): NState {
  if (message.activityState) {
    const s = message.activityState as ActivityState
    if (
      s === 'thinking' ||
      s === 'generating' ||
      s === 'planning' ||
      s === 'searching' ||
      s === 'reading' ||
      s === 'analyzing' ||
      s === 'executing' ||
      s === 'speaking' ||
      s === 'listening' ||
      s === 'waiting_for_approval' ||
      s === 'completed' ||
      s === 'error' ||
      s === 'idle'
    ) {
      return s
    }
  }
  if (message.isThinking || message.isStreaming)
    return message.isStreaming ? 'generating' : 'thinking'
  return 'white'
}

/** Single activity line — only when no content yet */
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
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null)
  const isUser = message.role === 'user'
  const active = Boolean(message.isThinking || message.isStreaming)
  const nState = nStateFor(message)
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

  return (
    <div className="flex gap-3 sm:gap-4 group">
      <div className="shrink-0 mt-0.5">
        <NIdentity
          state={nState}
          size={32}
          animated={active || nState === 'thinking' || nState === 'generating'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-medium text-sm text-nyven-text">NYVEN</span>
          {message.isStreaming && message.content && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-nyven-cyan animate-pulse"
              aria-hidden
            />
          )}
        </div>

        {/* Exactly one activity indicator — only before first token */}
        {showActivity ? (
          <ActivityIndicator
            state={message.activityState as ActivityState}
            detail={message.toolSummary || message.activityDetail}
          />
        ) : (
          <div className="text-[15px] leading-relaxed text-nyven-text whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom bg-nyven-cyan/80 animate-pulse" />
            )}
          </div>
        )}

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
                    setFeedbackNote(null)
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
                {feedbackNote && (
                  <span className="text-[11px] text-nyven-text-secondary ml-1">{feedbackNote}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
