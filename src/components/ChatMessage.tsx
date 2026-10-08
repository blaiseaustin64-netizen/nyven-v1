import { useState } from 'react'
import { Copy, Check, RotateCcw, Pencil, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react'
// feedback icons imported below
import { NIdentity, type NState } from './NIdentity'
import type { Message } from '../lib/types'

interface ChatMessageProps {
  message: Message
  onRegenerate?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isLast?: boolean
}

function statusLabel(message: Message): string | null {
  if (message.toolSummary && (message.isStreaming || message.isThinking)) {
    return message.toolSummary
  }
  if (message.activityState === 'searching') {
    return message.activityDetail || 'Searching the web'
  }
  if (message.activityState === 'analyzing') {
    return message.activityDetail || 'Analyzing'
  }
  if (message.activityState === 'reading') {
    return message.activityDetail || 'Reading'
  }
  if (message.activityState === 'thinking') {
    return message.activityDetail || 'Thinking'
  }
  if (message.activityState === 'generating' && !message.content) {
    return message.activityDetail || 'Generating'
  }
  if (message.isThinking && !message.content) {
    return 'Thinking'
  }
  return null
}

function nStateFor(message: Message): NState {
  if (message.activityState) {
    const s = message.activityState
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
  if (message.isThinking || message.isStreaming) return message.isStreaming ? 'generating' : 'thinking'
  return 'white'
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
  const label = statusLabel(message)
  const active = Boolean(message.isThinking || message.isStreaming)
  const nState = nStateFor(message)

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
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/[0.06] text-nyven-text-secondary max-w-[180px] truncate"
                    title={a.name}
                  >
                    {a.kind === 'image' ? '🖼' : '📄'} {a.name}
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
        <NIdentity state={nState} size={32} animated={active || nState === 'thinking' || nState === 'generating'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-medium text-sm text-nyven-text">NYVEN</span>
          {label && (
            <span className="text-[11px] text-nyven-text-secondary/80 tracking-wide">{label}</span>
          )}
          {message.isStreaming && message.content && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-nyven-cyan animate-pulse" />
          )}
        </div>

        {label && !message.content ? (
          <div className="text-nyven-text-secondary text-[15px] leading-relaxed">{label}…</div>
        ) : (
          <div className="text-[15px] leading-relaxed text-nyven-text whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-[2px] h-[1.1em] ml-0.5 align-text-bottom bg-nyven-cyan/80 animate-pulse" />
            )}
          </div>
        )}

        {!message.isStreaming && message.citations && message.citations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <p className="text-[11px] uppercase tracking-wider text-nyven-text-secondary mb-2">
              Sources
            </p>
            <ul className="space-y-1.5">
              {message.citations.map((c) => (
                <li key={c.id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 text-sm text-nyven-cyan/90 hover:text-nyven-cyan"
                  >
                    <span className="font-medium truncate">{c.title}</span>
                    <span className="text-[11px] text-nyven-text-secondary group-hover:text-nyven-text-secondary/80 truncate">
                      {c.source || (() => { try { return new URL(c.url).hostname } catch { return c.url } })()}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!active && message.content && (
          <div className="flex flex-wrap items-center gap-1 mt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
              aria-label="Copy message"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              disabled={feedback !== null}
              onClick={() => {
                setFeedback('positive')
                setFeedbackNote('Thanks for your feedback.')
                onFeedback?.(message.id, 'positive')
              }}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                feedback === 'positive'
                  ? 'text-nyven-cyan bg-nyven-cyan/10'
                  : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] disabled:opacity-40'
              }`}
              aria-label="Thumbs up"
              title="Helpful"
            >
              <ThumbsUp size={13} />
            </button>
            <button
              type="button"
              disabled={feedback !== null}
              onClick={() => {
                setFeedback('negative')
                setFeedbackNote('Thanks for your feedback.')
                onFeedback?.(message.id, 'negative')
              }}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                feedback === 'negative'
                  ? 'text-nyven-cyan bg-nyven-cyan/10'
                  : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] disabled:opacity-40'
              }`}
              aria-label="Thumbs down"
              title="Not helpful"
            >
              <ThumbsDown size={13} />
            </button>
            {onRegenerate && isLast && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-nyven-text-secondary hover:text-red-400 hover:bg-white/[0.05] transition-colors"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
        {feedbackNote && (
          <p className="text-[11px] text-nyven-text-secondary mt-1.5">{feedbackNote}</p>
        )}
      </div>
    </div>
  )
}
