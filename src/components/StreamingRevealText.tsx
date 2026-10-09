/**
 * Streamed assistant text with Claude-style blue→normal word reveal.
 * Words already shown stay settled; only new tokens get the cool-in animation.
 */
import { useMemo, useRef } from 'react'
import clsx from 'clsx'

type Props = {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamingRevealText({ content, isStreaming, className }: Props) {
  const settledCountRef = useRef(0)
  const prevContentRef = useRef('')

  const parts = useMemo(() => {
    // Split preserving whitespace so layout stays stable
    const tokens = content.split(/(\s+)/).filter((t) => t.length > 0)
    return tokens
  }, [content])

  // When content grows, previous word tokens are "settled"
  if (content.startsWith(prevContentRef.current) && content.length > prevContentRef.current.length) {
    // settle all complete words from previous length
    const prevTokens = prevContentRef.current.split(/(\s+)/).filter((t) => t.length > 0)
    settledCountRef.current = prevTokens.filter((t) => t.trim().length > 0).length
  } else if (content !== prevContentRef.current && !content.startsWith(prevContentRef.current)) {
    // full replace (regenerate) — settle nothing of old
    settledCountRef.current = 0
  }
  prevContentRef.current = content

  let wordIndex = 0

  return (
    <div className={clsx('text-[15px] leading-relaxed text-nyven-text whitespace-pre-wrap', className)}>
      <style>{`
        @keyframes nyven-word-cool {
          to {
            color: var(--nyven-fg, #e8ecf5);
            text-shadow: 0 0 0 rgba(79, 140, 255, 0);
          }
        }
        @keyframes nyven-type-pulse {
          50% { opacity: 0.3; }
        }
        .nyven-w {
          color: #4f8cff;
          text-shadow: 0 0 14px rgba(79, 140, 255, 0.55);
          animation: nyven-word-cool 1s ease-out forwards;
        }
        .nyven-w-settled {
          color: inherit;
          text-shadow: none;
          animation: none;
        }
        .nyven-typing-dot::after {
          content: "";
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-left: 5px;
          border-radius: 50%;
          background: #2f6bff;
          vertical-align: middle;
          animation: nyven-type-pulse 1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nyven-w {
            animation: none;
            color: inherit;
            text-shadow: none;
          }
          .nyven-typing-dot::after {
            animation: none;
            opacity: 0.7;
          }
        }
      `}</style>
      <span className={clsx(isStreaming && 'nyven-typing-dot')}>
        {parts.map((tok, i) => {
          if (!tok.trim()) {
            return <span key={`s-${i}`}>{tok}</span>
          }
          const idx = wordIndex++
          const settled = idx < settledCountRef.current
          return (
            <span
              key={`w-${i}-${tok.slice(0, 8)}`}
              className={settled ? 'nyven-w-settled' : 'nyven-w'}
            >
              {tok}
            </span>
          )
        })}
      </span>
    </div>
  )
}
