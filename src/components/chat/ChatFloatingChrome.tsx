import { ChevronDown } from 'lucide-react'
import { ReadAloudPlayer } from './ReadAloudPlayer'
import type { useReadAloud } from '../../hooks/useReadAloud'

type ReadAloudApi = ReturnType<typeof useReadAloud>

/**
 * Single floating layer above the composer: jump + read-aloud, never overlapping.
 * Parent should be `relative` (composer wrap).
 */
export function ChatFloatingChrome({
  showJump,
  onJump,
  readAloud,
}: {
  showJump: boolean
  onJump: () => void
  readAloud: ReadAloudApi
}) {
  const playerOpen = Boolean(readAloud.state.messageId)

  return (
    <div
      className="pointer-events-none absolute bottom-full left-0 right-0 z-20 flex flex-col items-stretch gap-2 px-3 pb-1"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="relative w-full max-w-3xl mx-auto flex flex-col items-center gap-2">
        {/* Jump: centered when no player; right-aligned when player is open */}
        {showJump && (
          <div
            className={
              playerOpen
                ? 'pointer-events-auto self-end'
                : 'pointer-events-auto self-center'
            }
          >
            <button
              type="button"
              onClick={onJump}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-nyven-surface/90 backdrop-blur-md border border-white/10 text-nyven-text shadow-lg shadow-black/30 hover:border-nyven-cyan/40 hover:text-nyven-cyan transition-colors"
              aria-label="Jump to latest"
              title="Jump to latest"
            >
              <ChevronDown size={20} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="pointer-events-auto w-full flex justify-center">
          <ReadAloudPlayer
            state={readAloud.state}
            onTogglePause={readAloud.togglePause}
            onSeek={readAloud.seek}
            onCycleRate={readAloud.cycleRate}
            onClose={readAloud.stop}
            bindProgressEl={readAloud.bindProgressEl}
          />
        </div>
      </div>
    </div>
  )
}
