import { useState } from 'react'
import { Copy, Check, RotateCcw, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { NIdentity } from './NIdentity'
import type { Message } from '../lib/types'

interface ChatMessageProps {
  message: Message
  onRegenerate?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isLast?: boolean
}

export function ChatMessage({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  isLast,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isThinking = message.isThinking

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

  // NYVEN message
  return (
    <div className="flex gap-3 sm:gap-4 group">
      <div className="shrink-0 mt-0.5">
        <NIdentity
          state={isThinking ? 'thinking' : 'white'}
          size={32}
          animated={isThinking}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-medium text-sm text-nyven-text">
            NYVEN
          </span>
          {isThinking && (
            <span className="text-xs text-nyven-cyan/80 animate-pulse">
              Thinking...
            </span>
          )}
        </div>

        {isThinking ? (
          <div className="text-nyven-text-secondary text-[15px] leading-relaxed">
            {message.content || 'Thinking through this...'}
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed text-nyven-text whitespace-pre-wrap reveal-text">
            {message.content}
          </div>
        )}

        {!isThinking && (
          <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onRegenerate && isLast && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
              >
                <RotateCcw size={13} />
                Regenerate
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-nyven-text-secondary hover:text-red-400 hover:bg-white/[0.05] transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
            }
