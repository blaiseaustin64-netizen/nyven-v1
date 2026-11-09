import { useEffect, useRef } from 'react'
import { Pause, Play, X, RotateCcw, RotateCw, Volume2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReadAloudState } from '../../hooks/useReadAloud'

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-3.5 w-[18px] shrink-0" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-cyan-400/90 origin-bottom"
          style={{
            height: active ? undefined : '30%',
            animation: active
              ? `nyven-wave ${0.42 + i * 0.1}s ease-in-out ${i * 0.07}s infinite alternate`
              : 'none',
            opacity: active ? 1 : 0.35,
          }}
        />
      ))}
      <style>{`
        @keyframes nyven-wave {
          0% { height: 22%; }
          100% { height: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="nyven-wave"] { animation: none !important; height: 50% !important; }
        }
      `}</style>
    </div>
  )
}

export function ReadAloudPlayer({
  state,
  onTogglePause,
  onSeek,
  onCycleRate,
  onClose,
  bindProgressEl,
}: {
  state: ReadAloudState
  onTogglePause: () => void
  onSeek: (d: number) => void
  onCycleRate: () => void
  onClose: () => void
  bindProgressEl?: (el: HTMLElement | null) => void
}) {
  const fillRef = useRef<HTMLSpanElement | null>(null)
  const open = Boolean(state.messageId)

  useEffect(() => {
    bindProgressEl?.(fillRef.current)
    return () => bindProgressEl?.(null)
  }, [bindProgressEl, open])

  const seekOnTrack = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!state.duration || state.duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const target = Math.floor(ratio * state.duration)
    const delta = target - state.elapsed
    if (delta !== 0) onSeek(delta)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nyven-read-aloud"
          initial={{ opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full flex justify-center"
          style={{ maxWidth: 'calc(100vw - 24px)' }}
          role="group"
          aria-label="Read aloud"
        >
          <div
            className="relative w-full max-w-[22rem] flex items-center gap-0.5 rounded-full pl-2.5 pr-1 py-1
              bg-[#11151d]/90 border border-white/[0.08]
              backdrop-blur-xl
              shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_24px_rgba(34,211,238,0.06)]"
          >
            {/* Smooth progress — driven by rAF via transform scaleX, no React per-frame */}
            <button
              type="button"
              onClick={seekOnTrack}
              className="absolute top-0 left-3 right-3 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08] overflow-hidden"
              aria-label="Seek"
            >
              <span
                ref={fillRef}
                className="block h-full w-full rounded-full bg-cyan-400/85"
                style={{
                  transform: 'scaleX(0)',
                  transformOrigin: 'left center',
                  willChange: 'transform',
                }}
              />
            </button>

            <div className="flex items-center gap-1 shrink-0 pl-0.5">
              <Volume2
                size={14}
                className={
                  state.playing || state.loading
                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]'
                    : 'text-white/50'
                }
              />
              <Waveform active={state.playing && !state.loading} />
            </div>

            <span className="text-[11px] text-white/45 tabular-nums w-7 shrink-0 text-center">
              {fmt(state.elapsed)}
            </span>

            <button
              type="button"
              onClick={() => onSeek(-15)}
              className="relative w-8 h-8 shrink-0 rounded-full grid place-items-center text-white/75 hover:bg-white/[0.08] active:scale-95"
              aria-label="Back 15 seconds"
            >
              <RotateCcw size={15} strokeWidth={2} />
              <span className="absolute inset-0 grid place-items-center text-[7px] font-semibold pt-0.5 pointer-events-none">
                15
              </span>
            </button>

            <button
              type="button"
              onClick={onTogglePause}
              className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-white hover:bg-white/[0.1] active:scale-95"
              aria-label={state.playing ? 'Pause' : 'Play'}
            >
              {state.loading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-cyan-400 animate-spin" />
              ) : state.playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSeek(15)}
              className="relative w-8 h-8 shrink-0 rounded-full grid place-items-center text-white/75 hover:bg-white/[0.08] active:scale-95"
              aria-label="Forward 15 seconds"
            >
              <RotateCw size={15} strokeWidth={2} />
              <span className="absolute inset-0 grid place-items-center text-[7px] font-semibold pt-0.5 pointer-events-none">
                15
              </span>
            </button>

            <button
              type="button"
              onClick={onCycleRate}
              className="h-7 min-w-[1.9rem] shrink-0 px-1 rounded-full text-[11px] font-medium text-white/80 hover:bg-white/[0.08]"
              aria-label="Playback speed"
            >
              {state.rate}x
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-white/55 hover:text-white/90 hover:bg-white/[0.08]"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
          {state.error && (
            <p className="absolute -bottom-5 left-0 right-0 text-[10px] text-red-300/90 text-center truncate px-2">
              {state.error}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
