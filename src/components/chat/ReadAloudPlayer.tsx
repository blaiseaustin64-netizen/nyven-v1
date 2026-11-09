import { Pause, Play, X, RotateCcw, RotateCw } from 'lucide-react'
import type { ReadAloudState } from '../../hooks/useReadAloud'

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Mini player matching the chat design:
 * [pause] [↺15] [↻15] [1x] [0:01] [X]
 * Slides above the composer; never overlaps the input.
 */
export function ReadAloudPlayer({
  state,
  onTogglePause,
  onSeek,
  onCycleRate,
  onClose,
}: {
  state: ReadAloudState
  onTogglePause: () => void
  onSeek: (d: number) => void
  onCycleRate: () => void
  onClose: () => void
}) {
  if (!state.messageId) return null
  return (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 flex items-center gap-0.5 pl-1.5 pr-1 py-1 rounded-full bg-[#2a2d35]/95 border border-white/[0.08] shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md"
      role="group"
      aria-label="Read aloud player"
    >
      <button
        type="button"
        onClick={onTogglePause}
        className="w-9 h-9 rounded-full grid place-items-center text-white/90 hover:bg-white/10 active:scale-95 transition"
        aria-label={state.playing ? 'Pause' : 'Play'}
      >
        {state.loading ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : state.playing ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => onSeek(-15)}
        className="relative w-9 h-9 rounded-full grid place-items-center text-white/80 hover:bg-white/10 active:scale-95 transition"
        aria-label="Back 15 seconds"
      >
        <RotateCcw size={18} strokeWidth={2} />
        <span className="absolute inset-0 grid place-items-center text-[8px] font-semibold pt-0.5 pointer-events-none">
          15
        </span>
      </button>

      <button
        type="button"
        onClick={() => onSeek(15)}
        className="relative w-9 h-9 rounded-full grid place-items-center text-white/80 hover:bg-white/10 active:scale-95 transition"
        aria-label="Forward 15 seconds"
      >
        <RotateCw size={18} strokeWidth={2} />
        <span className="absolute inset-0 grid place-items-center text-[8px] font-semibold pt-0.5 pointer-events-none">
          15
        </span>
      </button>

      <button
        type="button"
        onClick={onCycleRate}
        className="h-8 min-w-[2.25rem] px-2 rounded-full text-[12px] font-medium text-white/85 hover:bg-white/10 active:scale-95 transition"
        aria-label="Playback speed"
      >
        {state.rate}x
      </button>

      <span className="text-[12px] text-white/55 tabular-nums px-1.5 min-w-[2.5rem]">
        {fmt(state.elapsed)}
      </span>

      <button
        type="button"
        onClick={onClose}
        className="w-9 h-9 rounded-full grid place-items-center text-white/70 hover:bg-white/10 active:scale-95 transition"
        aria-label="Close"
      >
        <X size={18} />
      </button>
    </div>
  )
}
