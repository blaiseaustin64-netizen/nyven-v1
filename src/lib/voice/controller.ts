/**
 * Voice Controller — mic → STT → (caller runs Core) → TTS → playback.
 * Does not duplicate Core intelligence.
 */

import { MicRecorder } from './recorder'
import { SpeechPlayback, fetchSTT, fetchTTS } from './playback'
import { getVoicePreferences } from './preferences'

export type VoicePhase =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'transcribing'
  | 'speaking'
  | 'error'

export type VoiceControllerHandlers = {
  onPhase?: (phase: VoicePhase, detail?: string) => void
  /** Real mic level 0–1 while listening */
  onListenLevel?: (level: number) => void
  /** Real playback energy 0–1 while speaking */
  onSpeakEnergy?: (level: number) => void
  onTranscript?: (text: string) => void
  onError?: (message: string) => void
}

export class VoiceController {
  private recorder = new MicRecorder()
  private playback = new SpeechPlayback()
  private handlers: VoiceControllerHandlers = {}
  private sttAbort: AbortController | null = null
  private ttsAbort: AbortController | null = null
  private phase: VoicePhase = 'idle'
  private listenMode = false

  setHandlers(h: VoiceControllerHandlers) {
    this.handlers = h
    this.recorder.setHandlers({
      onStart: () => this.setPhase('listening'),
      onStop: (blob) => {
        void this.afterRecord(blob)
      },
      onError: (_code, message) => {
        this.setPhase('error', message)
        this.handlers.onError?.(message)
        this.setPhase('idle')
      },
      onLevel: (level) => this.handlers.onListenLevel?.(level),
    })
    this.playback.setHandlers({
      onStart: () => this.setPhase('speaking'),
      onEnd: () => {
        this.setPhase('idle')
      },
      onError: (message) => {
        this.handlers.onError?.(message)
        this.setPhase('idle')
      },
      onEnergy: (e) => this.handlers.onSpeakEnergy?.(e),
    })
  }

  getPhase(): VoicePhase {
    return this.phase
  }

  private setPhase(phase: VoicePhase, detail?: string) {
    this.phase = phase
    this.handlers.onPhase?.(phase, detail)
  }

  /** Toggle: start listening or stop & transcribe */
  async toggleListen(): Promise<void> {
    if (this.phase === 'listening') {
      await this.recorder.stop()
      return
    }
    if (this.phase === 'speaking') {
      this.stopSpeaking()
      return
    }
    if (this.phase !== 'idle' && this.phase !== 'error') return

    if (!MicRecorder.isSupported()) {
      this.handlers.onError?.('Voice input is not supported in this browser.')
      return
    }

    this.listenMode = true
    this.setPhase('requesting_permission')
    try {
      await this.recorder.start()
    } catch {
      this.listenMode = false
      this.setPhase('idle')
    }
  }

  private async afterRecord(blob: Blob) {
    if (!this.listenMode) return
    this.listenMode = false
    if (!blob.size) {
      this.handlers.onError?.('No audio was captured.')
      this.setPhase('idle')
      return
    }
    this.setPhase('transcribing')
    this.sttAbort = new AbortController()
    try {
      const text = await fetchSTT(blob, this.sttAbort.signal)
      if (!text) {
        this.handlers.onError?.('Could not understand the audio. Please try again.')
        this.setPhase('idle')
        return
      }
      this.handlers.onTranscript?.(text)
      // Phase returns to idle; Core activity takes over in Chat
      this.setPhase('idle')
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        this.setPhase('idle')
        return
      }
      this.handlers.onError?.(
        err instanceof Error ? err.message : 'Speech recognition failed.'
      )
      this.setPhase('idle')
    } finally {
      this.sttAbort = null
    }
  }

  /** Speak final assistant text (not tool status lines) */
  async speak(text: string): Promise<void> {
    const prefs = getVoicePreferences()
    if (!prefs.enabled || !prefs.autoSpeak) return
    if (!text.trim()) return

    this.stopSpeaking()
    this.ttsAbort = new AbortController()
    try {
      const blob = await fetchTTS(text, prefs.voiceId, this.ttsAbort.signal)
      await this.playback.play(blob)
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return
      // Text remains visible — do not lose the response
      this.handlers.onError?.(
        err instanceof Error
          ? err.message
          : 'Could not play speech. The text response is still available.'
      )
      this.setPhase('idle')
    } finally {
      this.ttsAbort = null
    }
  }

  stopSpeaking(): void {
    this.ttsAbort?.abort()
    this.ttsAbort = null
    this.playback.stop()
    if (this.phase === 'speaking') this.setPhase('idle')
  }

  /** Full stop: mic + STT + TTS */
  stopAll(): void {
    this.listenMode = false
    this.sttAbort?.abort()
    this.sttAbort = null
    this.recorder.cancel()
    this.stopSpeaking()
    this.setPhase('idle')
  }
}
