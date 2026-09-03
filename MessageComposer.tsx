import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Mic, Square } from 'lucide-react'
import clsx from 'clsx'

interface MessageComposerProps {
  onSend: (text: string) => void
  isGenerating?: boolean
  onStop?: () => void
  placeholder?: string
  autoFocus?: boolean
}

export function MessageComposer({
  onSend,
  isGenerating = false,
  onStop,
  placeholder = 'Message NYVEN...',
  autoFocus = false,
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isGenerating) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }

  return (
    <div className="border-t border-white/[0.05] bg-nyven-bg/80 backdrop-blur-md safe-bottom">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">
        <div className="relative flex items-end gap-2 bg-nyven-surface border border-white/[0.07] rounded-2xl px-3 py-2.5 focus-within:border-nyven-cyan/30 transition-colors duration-200">
          <button
            type="button"
            className="shrink-0 p-2 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
            aria-label="Attach file"
            title="Attachment (coming soon)"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder}
            rows={1}
            disabled={isGenerating}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-[15px] leading-relaxed text-nyven-text placeholder:text-nyven-text-secondary/70 max-h-40 py-1.5"
            style={{ minHeight: '24px' }}
          />

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-2 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
              aria-label="Voice input"
              title="Voice (coming soon)"
            >
              <Mic size={18} />
            </button>

            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="p-2 rounded-xl bg-nyven-surface text-nyven-text hover:bg-white/[0.08] transition-colors"
                aria-label="Stop generating"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!value.trim()}
                className={clsx(
                  'p-2 rounded-xl transition-all duration-200',
                  value.trim()
                    ? 'bg-nyven-cyan text-nyven-bg hover:bg-nyven-cyan/90'
                    : 'bg-white/[0.06] text-nyven-text-secondary cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-nyven-text-secondary/50 mt-2">
          NYVEN V1 · Demo responses · Backend coming soon
        </p>
      </div>
    </div>
  )
}
