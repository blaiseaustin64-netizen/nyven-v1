/**
 * Settings → Voice & Speech: catalog selector, Claude orb, real TTS preview, save.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Volume2 } from 'lucide-react'
import {
  VOICE_CATALOG,
  getDefaultVoice,
  getVoiceByFishId,
  resolveFishVoiceId,
  type VoiceCatalogEntry,
} from '../../lib/voice/catalog'
import { setVoicePreferences } from '../../lib/voice/preferences'
import { ClaudeLiquidOrb, type ClaudeOrbState } from './ClaudeLiquidOrb'

type Props = {
  /** Current prefs voiceId from Settings parent */
  voiceId: string
  voiceEnabled: boolean
  autoSpeak: boolean
  onChangeVoiceId: (fishVoiceId: string) => void
  onToggleEnabled: (on: boolean) => void
  onToggleAutoSpeak: (on: boolean) => void
  onSave: (fishVoiceId: string) => Promise<void>
  saving?: boolean
}

export function VoiceSpeechSettings({
  voiceId,
  voiceEnabled,
  autoSpeak,
  onChangeVoiceId,
  onToggleEnabled,
  onToggleAutoSpeak,
  onSave,
  saving,
}: Props) {
  const resolved = resolveFishVoiceId(voiceId)
  const selected =
    getVoiceByFishId(resolved) || getDefaultVoice()

  const [draftId, setDraftId] = useState(selected.fishVoiceId)
  const [orbState, setOrbState] = useState<ClaudeOrbState>('calm')
  const [previewStatus, setPreviewStatus] = useState<
    'idle' | 'loading' | 'playing' | 'blocked' | 'error'
  >('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const draftVoice =
    getVoiceByFishId(draftId) || getDefaultVoice()

  // Preview controller refs — prevent stale audio
  const previewGen = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setDraftId(resolveFishVoiceId(voiceId))
  }, [voiceId])

  const stopPreview = useCallback(() => {
    previewGen.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      try {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      } catch {
        /* ignore */
      }
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setOrbState('calm')
    setPreviewStatus((s) => (s === 'loading' || s === 'playing' ? 'idle' : s))
  }, [])

  useEffect(() => () => stopPreview(), [stopPreview])

  const playPreview = useCallback(
    async (voice: VoiceCatalogEntry, fromUserGesture: boolean) => {
      stopPreview()
      const gen = ++previewGen.current
      setPreviewError(null)
      setPreviewStatus('loading')
      setOrbState('think')

      const ac = new AbortController()
      abortRef.current = ac

      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: voice.previewSentence,
            voiceId: voice.fishVoiceId,
          }),
          signal: ac.signal,
        })
        if (gen !== previewGen.current) return
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || `Preview failed (HTTP ${res.status}).`)
        }
        const buf = await res.arrayBuffer()
        if (gen !== previewGen.current) return
        if (!buf.byteLength) throw new Error('Preview returned empty audio.')

        const blob = new Blob([buf], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          if (gen !== previewGen.current) return
          setOrbState('calm')
          setPreviewStatus('idle')
        }
        audio.onerror = () => {
          if (gen !== previewGen.current) return
          setOrbState('calm')
          setPreviewStatus('error')
          setPreviewError('Could not play preview audio.')
        }

        try {
          await audio.play()
          if (gen !== previewGen.current) return
          setOrbState('speak')
          setPreviewStatus('playing')
        } catch {
          if (gen !== previewGen.current) return
          setOrbState('calm')
          setPreviewStatus('blocked')
          setPreviewError(
            fromUserGesture
              ? 'Playback failed. Tap Play preview to try again.'
              : 'Browser blocked autoplay. Tap Play preview to hear this voice.'
          )
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (gen !== previewGen.current) return
        setOrbState('calm')
        setPreviewStatus('error')
        setPreviewError(
          err instanceof Error ? err.message : 'Could not generate preview.'
        )
      }
    },
    [stopPreview]
  )

  const selectVoice = (voice: VoiceCatalogEntry) => {
    setDraftId(voice.fishVoiceId)
    onChangeVoiceId(voice.fishVoiceId)
    setSaveMsg(null)
    void playPreview(voice, true)
  }

  const handleSave = async () => {
    setSaveMsg(null)
    // Persist to voice controller prefs immediately
    setVoicePreferences({
      voiceId: draftId,
      enabled: voiceEnabled,
      autoSpeak,
    })
    try {
      await onSave(draftId)
      setSaveMsg('Voice saved.')
    } catch {
      setSaveMsg('Could not save preference.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        <ClaudeLiquidOrb
          state={orbState}
          paletteA={draftVoice.palette.calm.a}
          paletteB={draftVoice.palette.calm.b}
          size={180}
        />
        <p className="text-sm text-nyven-text-secondary">
          {orbState === 'speak'
            ? 'Speaking'
            : orbState === 'think'
              ? 'Preparing preview…'
              : draftVoice.displayName}
        </p>
      </div>

      <div className="space-y-2" role="listbox" aria-label="Voice options">
        {VOICE_CATALOG.map((v) => {
          const on = draftId === v.fishVoiceId
          return (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => selectVoice(v)}
              className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors min-h-[56px] ${
                on
                  ? 'border-nyven-cyan/40 bg-nyven-cyan/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-nyven-text">{v.displayName}</p>
                  <p className="text-xs text-nyven-text-secondary mt-0.5 leading-relaxed">
                    {v.description}
                  </p>
                </div>
                {on && (
                  <span className="shrink-0 mt-0.5 text-nyven-cyan">
                    <Check size={16} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {(previewStatus === 'loading' ||
        previewStatus === 'blocked' ||
        previewStatus === 'error' ||
        previewStatus === 'playing') && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-nyven-text-secondary">
          {previewStatus === 'loading' && (
            <>
              <Loader2 size={14} className="animate-spin text-nyven-cyan" />
              Generating preview…
            </>
          )}
          {previewStatus === 'playing' && (
            <>
              <Volume2 size={14} className="text-nyven-cyan" />
              Playing preview
            </>
          )}
          {(previewStatus === 'blocked' || previewStatus === 'error') && (
            <>
              <span className="text-red-300/90">{previewError}</span>
              <button
                type="button"
                onClick={() => void playPreview(draftVoice, true)}
                className="px-3 py-1.5 rounded-lg border border-white/[0.1] hover:bg-white/[0.05] text-nyven-text min-h-[36px]"
              >
                Play preview
              </button>
            </>
          )}
          {previewStatus === 'playing' && (
            <button
              type="button"
              onClick={stopPreview}
              className="px-3 py-1.5 rounded-lg border border-white/[0.1] hover:bg-white/[0.05] min-h-[36px]"
            >
              Stop
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Saving…' : 'Save Voice'}
        </button>
        {saveMsg && (
          <span className="text-xs text-nyven-text-secondary">{saveMsg}</span>
        )}
      </div>

      <div className="space-y-3 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-nyven-text">Voice features</span>
          <Toggle on={voiceEnabled} onChange={onToggleEnabled} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-nyven-text">Auto-speak responses</span>
          <Toggle on={autoSpeak} onChange={onToggleAutoSpeak} />
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        on ? 'bg-nyven-cyan' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

// silence unused import if tree-shaken
