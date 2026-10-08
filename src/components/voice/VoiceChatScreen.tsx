/**
 * Full-screen Voice Chat mode.
 * Reuses VoiceController + existing Core stream path via callbacks.
 * Cleanup on close/unmount: mic, STT, TTS, animation (via LiquidVoice).
 */
import { useEffect, useCallback } from 'react'
import { X, Mic, MicOff, Volume2 } from 'lucide-react'
import clsx from 'clsx'
import { LiquidVoice, type LiquidMode } from '../LiquidVoice'
import type { VoicePhase } from '../../lib/voice/controller'
import { NIdentity } from '../NIdentity'

export type VoiceChatStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

type Props = {
  open: boolean
  onClose: () => void
  voicePhase: VoicePhase
  /** Core stream activity while processing a voice turn */
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

function statusLabel(
  phase: VoicePhase,
  isProcessing: boolean,
  isSpeaking: boolean
): VoiceChatStatus {
  if (isSpeaking || phase === 'speaking') return 'speaking'
  if (isProcessing || phase === 'transcribing') return 'thinking'
  if (phase === 'listening' || phase === 'requesting_permission') return 'listening'
  if (phase === 'error') return 'error'
  return 'idle'
}

const STATUS_TEXT: Record<VoiceChatStatus, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Something went wrong',
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
  lastTranscript,
  lastReply,
}: Props) {
  const mode = mapMode(voicePhase, isProcessing, isSpeaking)
  const status = statusLabel(voicePhase, isProcessing, isSpeaking)

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
      className="fixed inset-0 z-[80] flex flex-col bg-[#07090D]"
      role="dialog"
      aria-modal="true"
      aria-label="Voice chat"
    >
      {/* Depth gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(28,34,48,0.9) 0%, rgba(7,9,13,1) 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 55%, rgba(98,230,255,0.06) 0%, transparent 45%)',
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <NIdentity state="white" size={28} />
          <span className="font-display text-sm font-medium tracking-wide text-nyven-text">
            NYVEN Voice
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMute}
            className={clsx(
              'p-2.5 rounded-xl transition-colors',
              muted
                ? 'text-amber-300/90 bg-amber-400/10'
                : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]'
            )}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors"
            aria-label="Close voice chat"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Center visual */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <LiquidVoice mode={mode} energy={muted ? 0 : energy} size={240} className="mb-8" />

        <p
          className={clsx(
            'font-display text-lg sm:text-xl tracking-wide mb-2',
            status === 'listening' && 'text-nyven-cyan',
            status === 'thinking' && 'text-nyven-text',
            status === 'speaking' && 'text-nyven-cyan',
            status === 'idle' && 'text-nyven-text-secondary',
            status === 'error' && 'text-red-300'
          )}
          aria-live="polite"
        >
          {STATUS_TEXT[status]}
        </p>
        {statusHint && (
          <p className="text-xs text-nyven-text-secondary/80 text-center max-w-sm">{statusHint}</p>
        )}
        {!statusHint && status === 'idle' && (
          <p className="text-xs text-nyven-text-secondary/70 text-center max-w-sm">
            Tap the mic below to speak. NYVEN will listen, think, and reply aloud.
          </p>
        )}

        {(lastTranscript || lastReply) && (
          <div className="mt-8 w-full max-w-md space-y-3 text-sm">
            {lastTranscript && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-nyven-text-secondary">
                <span className="text-[10px] uppercase tracking-wider text-nyven-text-secondary/60">
                  You
                </span>
                <p className="mt-1 text-nyven-text leading-relaxed">{lastTranscript}</p>
              </div>
            )}
            {lastReply && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-nyven-text-secondary">
                <span className="text-[10px] uppercase tracking-wider text-nyven-text-secondary/60 inline-flex items-center gap-1">
                  <Volume2 size={10} /> NYVEN
                </span>
                <p className="mt-1 text-nyven-text leading-relaxed line-clamp-6">{lastReply}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom control */}
      <div className="relative z-10 flex flex-col items-center pb-10 pt-4 px-6">
        <button
          type="button"
          onClick={onToggleListen}
          disabled={muted || isProcessing || isSpeaking}
          className={clsx(
            'h-16 w-16 rounded-full flex items-center justify-center transition-all duration-200',
            voicePhase === 'listening'
              ? 'bg-nyven-cyan text-nyven-bg shadow-[0_0_32px_rgba(98,230,255,0.25)]'
              : 'bg-white/[0.06] text-nyven-text border border-white/[0.08] hover:bg-white/[0.1]',
            (muted || isProcessing || isSpeaking) && 'opacity-40 cursor-not-allowed'
          )}
          aria-label={voicePhase === 'listening' ? 'Stop listening' : 'Start listening'}
        >
          <Mic size={24} />
        </button>
        <p className="mt-3 text-[11px] text-nyven-text-secondary/60">
          {voicePhase === 'listening' ? 'Tap to finish' : 'Tap to speak'}
        </p>
      </div>
    </div>
  )
}
