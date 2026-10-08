/**
 * Single premium activity indicator for in-flight NYVEN responses.
 * Driven only by real ActivityState from the stream — no fake timers.
 * Exactly one instance should render per streaming message.
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { ActivityState } from '../lib/core/types'

const LABELS: Partial<Record<ActivityState, string>> = {
  thinking: 'Thinking',
  planning: 'Planning',
  searching: 'Searching',
  reading: 'Reading',
  analyzing: 'Analyzing',
  executing: 'Working',
  generating: 'Generating',
  waiting_for_approval: 'Waiting',
}

type Props = {
  state: ActivityState | undefined
  detail?: string
  className?: string
}

export function ActivityIndicator({ state, detail, className }: Props) {
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (!state || state === 'completed' || state === 'error' || state === 'idle') return
    let raf = 0
    let t0 = performance.now()
    const loop = (t: number) => {
      setPulse(((t - t0) / 1000) % 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state])

  if (!state || state === 'completed' || state === 'error' || state === 'idle') return null

  const label = detail?.trim() || LABELS[state] || 'Working'

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2.5 text-[14px] text-nyven-text-secondary select-none',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
        {[0, 1, 2].map((i) => {
          const phase = (pulse + i * 0.22) % 1
          const opacity = 0.25 + 0.55 * Math.sin(phase * Math.PI)
          const scale = 0.55 + 0.45 * Math.sin(phase * Math.PI)
          return (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-nyven-cyan"
              style={{
                transform: `translateX(${(i - 1) * 5}px) scale(${scale})`,
                opacity,
              }}
            />
          )
        })}
      </span>
      <span className="tracking-wide">{label}</span>
    </div>
  )
}
