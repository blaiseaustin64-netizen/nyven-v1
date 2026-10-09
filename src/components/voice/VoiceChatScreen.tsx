/**
 * Full-screen Voice Chat — focus on liquid visualization + real state.
 * Minimal chrome while processing/speaking.
 */
import { useEffect, useCallback } from 'react'
import { X, Mic, MicOff } from 'lucide-react'
import clsx from 'clsx'
import { LiquidVoice, type LiquidMode } from '../LiquidVoice'
import type { VoicePhase } from '../../lib/voice/controller'

type Props = {
  open: boolean
  onClose: () => void
  voicePhase: VoicePhase
  isProcessing: boolean
  isSpeaking: boolean
  energy: number
  muted: boolean
  onToggleMute: () => void
  onToggleListen: () => void
  statusHint?: string | null
  lastTranscript?: string | null
  lastReply?: string | null
}

function mapMode(
  phase: VoicePhase,
  isProcessing: boolean,
  isSpeaking: boolean
): LiquidMode {
  if (isSpeaking || phase === 'speaking') return 'speaking'
  if (isProcessing || phase === 'transcribing') return 'thinking'
  if (phase === 'listening' || phase === 'requesting_permission') return 'listening'
  return 'idle'
}

function statusText(
  phase: VoicePhase,
  isProcessing: boolean,
  isSpeaking: boolean
): string {
  if (isSpeaking || phase === 'speaking') return 'Speaking'
  if (isProcessing || phase === 'transcribing') return 'Thinking'
  if (phase === 'listening' || phase === 'requesting_permission') return 'Listening'
  if (phase === 'error') return 'Something went wrong'
  return 'Idle'
}

export function VoiceChatScreen({
  open,
  onClose,
  voicePhase,
  isProcessing,
  isSpeaking,
  energy,
  muted,
  onToggleMute,
  onToggleListen,
  statusHint,
  lastTranscript: _lastTranscript,
  lastReply: _lastReply,
}: Props) {
  const mode = mapMode(voicePhase, isProcessing, isSpeaking)
  const status = statusText(voicePhase, isProcessing, isSpeaking)
  const focused = isSpeaking || isProcessing || voicePhase === 'transcribing'

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onKey])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: '#07080d', color: '#e8ecf5' }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice chat"
    >
      {/* Full-bleed WebGL liquid */}
      <div className="absolute inset-0">
        <LiquidVoice
          mode={mode}
          energy={muted ? 0 : energy}
          fill
        />
      </div>

      {/* Top controls only — no large branding while answering */}
      <header className="relative z-10 flex items-center justify-end gap-1 px-4 sm:px-5 pt-4 sm:pt-5">
        <button
          type="button"
          onClick={onToggleMute}
          className={clsx(
            'p-2.5 rounded-full transition-colors',
            muted
              ? 'text-amber-200/90 bg-white/10'
              : 'text-[#7d869c] hover:text-[#e8ecf5] hover:bg-white/[0.08]'
          )}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-full text-[#7d869c] hover:text-[#e8ecf5] hover:bg-white/[0.08] transition-colors"
          aria-label="Close voice chat"
        >
          <X size={18} />
        </button>
      </header>

      {/* Center: status only */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-end pb-4 px-6 pointer-events-none">
        <p
          className="text-[15px] tracking-wide mb-2"
          style={{ color: focused ? '#e8ecf5' : '#7d869c' }}
          aria-live="polite"
        >
          {status}
        </p>
        {statusHint && (
          <p className="text-xs text-center max-w-sm mb-2" style={{ color: '#7d869c' }}>
            {statusHint}
          </p>
        )}

      </div>

      {/* Bottom mic */}
      <div className="relative z-10 flex flex-col items-center pb-10 pt-2 px-6">
        <button
          type="button"
          onClick={onToggleListen}
          disabled={muted || isProcessing || isSpeaking}
          className={clsx(
            'h-14 w-14 rounded-full flex items-center justify-center transition-all duration-200',
            voicePhase === 'listening'
              ? 'bg-white/20 text-[#e8ecf5]'
              : 'bg-white/[0.08] text-[#7d869c] hover:text-[#e8ecf5] hover:bg-white/[0.12]',
            (muted || isProcessing || isSpeaking) && 'opacity-40 cursor-not-allowed'
          )}
          aria-label={voicePhase === 'listening' ? 'Stop listening' : 'Start listening'}
        >
          <Mic size={22} />
        </button>
        <p className="mt-3 text-[12px]" style={{ color: '#7d869c' }}>
          {voicePhase === 'listening' ? 'Tap to finish' : 'Tap to speak'}
        </p>
      </div>
    </div>
  )
}
