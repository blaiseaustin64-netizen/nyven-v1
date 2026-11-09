import { Pause, Play, X, RotateCcw, RotateCw, Volume2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReadAloudState } from '../../hooks/useReadAloud'

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Subtle equalizer bars — animates only while playing */
function Waveform({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3]
  return (
    <div className="flex items-end gap-[3px] h-4 w-5 shrink-0" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-cyan-400/90 origin-bottom"
          style={{
            height: active ? undefined : '28%',
            animation: active
              ? `nyven-wave ${0.45 + i * 0.12}s ease-in-out ${i * 0.08}s infinite alternate`
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
          [style*="nyven-wave"] { animation: none !important; height: 55% !important; }
        }
      `}</style>
    </div>
  )
}

/**
 * NYVEN Read Aloud floating pill — glass, cyan accent, smooth reveal.
 * Controls only; TTS logic stays in useReadAloud.
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
  const open = Boolean(state.messageId)
  const progress =
    state.duration > 0 ? Math.min(1, state.elapsed / state.duration) : state.loading ? 0.08 : 0

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
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-20 w-[min(100%,22rem)] px-1"
          role="group"
          aria-label="Read aloud"
        >
          <div
            className="relative flex flex-col gap-1.5 rounded-full px-2.5 py-1.5
              bg-[#11151d]/85 border border-white/[0.08]
              backdrop-blur-xl
              shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_24px_rgba(34,211,238,0.06)]"
          >
            {/* Progress line */}
            <button
              type="button"
              onClick={seekOnTrack}
              className="absolute top-0 left-4 right-4 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08] overflow-hidden cursor-pointer"
              aria-label="Seek"
            >
              <motion.span
                className="block h-full rounded-full bg-cyan-400/80"
                initial={false}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.15, ease: 'linear' }}
              />
            </button>

            <div className="flex items-center gap-0.5 min-h-[40px]">
              {/* Voice mark + waveform */}
              <div className="flex items-center gap-1.5 pl-1 pr-1 shrink-0">
                <Volume2
                  size={15}
                  className={
                    state.playing || state.loading
                      ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]'
                      : 'text-white/55'
                  }
                />
                <Waveform active={state.playing && !state.loading} />
              </div>

              <span className="text-[11px] text-white/45 tabular-nums w-8 shrink-0">
                {fmt(state.elapsed)}
              </span>

              <button
                type="button"
                onClick={() => onSeek(-15)}
                className="relative w-9 h-9 rounded-full grid place-items-center text-white/75 hover:bg-white/[0.08] active:scale-95 transition"
                aria-label="Back 15 seconds"
              >
                <RotateCcw size={16} strokeWidth={2} />
                <span className="absolute inset-0 grid place-items-center text-[7px] font-semibold pt-0.5 pointer-events-none">
                  15
                </span>
              </button>

              <button
                type="button"
                onClick={onTogglePause}
                className="w-9 h-9 rounded-full grid place-items-center text-white hover:bg-white/[0.1] active:scale-95 transition"
                aria-label={state.playing ? 'Pause' : 'Play'}
              >
                {state.loading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-cyan-400 animate-spin" />
                ) : state.playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" className="ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSeek(15)}
                className="relative w-9 h-9 rounded-full grid place-items-center text-white/75 hover:bg-white/[0.08] active:scale-95 transition"
                aria-label="Forward 15 seconds"
              >
                <RotateCw size={16} strokeWidth={2} />
                <span className="absolute inset-0 grid place-items-center text-[7px] font-semibold pt-0.5 pointer-events-none">
                  15
                </span>
              </button>

              <button
                type="button"
                onClick={onCycleRate}
                className="h-8 min-w-[2.1rem] px-1.5 rounded-full text-[11px] font-medium text-white/80 hover:bg-white/[0.08] active:scale-95 transition"
                aria-label="Playback speed"
              >
                {state.rate}x
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full grid place-items-center text-white/55 hover:text-white/90 hover:bg-white/[0.08] active:scale-95 transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {state.error && (
              <p className="px-2 pb-1 text-[10px] text-red-300/90 truncate text-center">{state.error}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
