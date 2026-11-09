/**
 * Paced stream reveal: buffer tokens, reveal by word with soft fade via rAF.
 * Catches up quickly when the stream ends so no text stays hidden.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

type Props = {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamingRevealText({ content, isStreaming, className }: Props) {
  const [visible, setVisible] = useState('')
  const targetRef = useRef(content)
  const visibleRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const lastTs = useRef(0)

  targetRef.current = content

  useEffect(() => {
    const tick = (ts: number) => {
      const target = targetRef.current
      let vis = visibleRef.current

      if (!target.startsWith(vis)) {
        // regenerate / replace
        vis = ''
      }

      if (vis.length < target.length) {
        const dt = lastTs.current ? ts - lastTs.current : 16
        lastTs.current = ts
        // While streaming: ~1–3 words per frame; when done: catch up fast
        const remaining = target.slice(vis.length)
        const words = remaining.split(/(\s+)/)
        let take = 0
        let wordBudget = isStreaming ? (dt > 24 ? 2 : 1) : 12
        for (const part of words) {
          take += part.length
          if (part.trim()) {
            wordBudget -= 1
            if (wordBudget <= 0) break
          }
        }
        if (take <= 0) take = Math.min(remaining.length, isStreaming ? 4 : remaining.length)
        vis = target.slice(0, vis.length + take)
        visibleRef.current = vis
        setVisible(vis)
      } else if (vis !== target) {
        vis = target
        visibleRef.current = vis
        setVisible(vis)
      }

      if (visibleRef.current.length < targetRef.current.length || isStreaming) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        lastTs.current = 0
      }
    }

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [content, isStreaming])

  // Split for soft fade on the newest word only
  const tokens = visible.split(/(\s+)/).filter((t) => t.length > 0)
  let wordIndex = 0
  const lastWordIdx = (() => {
    let n = -1
    let i = 0
    for (const t of tokens) {
      if (t.trim()) n = i
      i++
    }
    return n
  })()

  return (
    <div className={clsx('text-[15px] leading-relaxed text-nyven-text whitespace-pre-wrap', className)}>
      <style>{`
        @keyframes nyven-soft-fade {
          from { opacity: 0.35; }
          to { opacity: 1; }
        }
        .nyven-reveal-word {
          animation: nyven-soft-fade 0.28s ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .nyven-reveal-word { animation: none; }
        }
      `}</style>
      {tokens.map((tok, i) => {
        if (!tok.trim()) return <span key={`s-${i}`}>{tok}</span>
        const isNew = isStreaming && i === lastWordIdx
        wordIndex++
        return (
          <span key={`w-${i}-${wordIndex}`} className={isNew ? 'nyven-reveal-word' : undefined}>
            {tok}
          </span>
        )
      })}
      {isStreaming && <span className="nyven-typing-dot" aria-hidden />}
    </div>
  )
}
