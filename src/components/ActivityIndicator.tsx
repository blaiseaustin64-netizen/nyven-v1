/**
 * Claude-style shimmer activity label — driven by real ActivityState only.
 * Exactly one instance per in-flight response; no fake timers.
 */
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
  if (!state || state === 'completed' || state === 'error' || state === 'idle') return null

  const label = detail?.trim() || LABELS[state] || 'Working'

  return (
    <div
      className={clsx('select-none', className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <style>{`
        @keyframes nyven-shimmer-sweep {
          from { background-position: 120% 0; }
          to { background-position: -100% 0; }
        }
        .nyven-shimmer {
          background: linear-gradient(90deg, #5d667d 0%, #e8ecf5 45%, #5d667d 90%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: nyven-shimmer-sweep 1.8s linear infinite;
          font-size: 15px;
          letter-spacing: 0.01em;
        }
        @media (prefers-reduced-motion: reduce) {
          .nyven-shimmer {
            animation: none;
            color: #7d869c;
            background: none;
            -webkit-background-clip: unset;
            background-clip: unset;
          }
        }
      `}</style>
      <span className="nyven-shimmer">{label}</span>
    </div>
  )
}
