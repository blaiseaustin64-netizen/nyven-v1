/**
 * Voice session controller — listen (STT) + speak (TTS).
 * Phases reflect real recorder / network / playback state only.
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

export type VoiceHandlers = {
  onPhase?: (phase: VoicePhase, detail?: string) => void
  onTranscript?: (text: string) => void
  onError?: (message: string) => void
  onListenLevel?: (level: number) => void
  onSpeakEnergy?: (level: number) => void
}

export class VoiceController {
  private recorder = new MicRecorder()
  private playback = new SpeechPlayback()
  private handlers: VoiceHandlers = {}
  private phase: VoicePhase = 'idle'
  private sttAbort: AbortController | null = null
  private ttsAbort: AbortController | null = null
  private listenMode = false
  private sttInFlight = false
  private lastTranscriptAt = 0

  constructor() {
    this.recorder.setHandlers({
      onStart: () => this.setPhase('listening'),
      onStop: (blob) => {
        void this.afterRecord(blob)
      },
      onError: (_code, message) => {
        this.listenMode = false
        this.handlers.onError?.(message)
        this.setPhase('idle')
      },
      onLevel: (level) => this.handlers.onListenLevel?.(level),
    })
    this.playback.setHandlers({
      onStart: () => this.setPhase('speaking'),
      onEnd: () => {
        if (this.phase === 'speaking') this.setPhase('idle')
      },
      onError: (message) => {
        this.handlers.onError?.(message)
        if (this.phase === 'speaking') this.setPhase('idle')
      },
      onEnergy: (level) => this.handlers.onSpeakEnergy?.(level),
    })
  }

  setHandlers(h: VoiceHandlers) {
    this.handlers = h
  }

  getPhase(): VoicePhase {
    return this.phase
  }

  private setPhase(phase: VoicePhase, detail?: string) {
    this.phase = phase
    this.handlers.onPhase?.(phase, detail)
  }

  prepareAudio(): void {
    void this.playback.unlock()
  }

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

    this.prepareAudio()
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
    if (this.sttInFlight) {
      console.warn('[nyven-stt] ignored overlapping STT request')
      return
    }
    this.sttInFlight = true
    this.setPhase('transcribing')
    this.sttAbort = new AbortController()
    try {
      if (import.meta.env.DEV) {
        console.info('[nyven-stt] request', { bytes: blob.size, mime: blob.type })
      }
      const text = await fetchSTT(blob, this.sttAbort.signal)
      if (!text) {
        this.handlers.onError?.('Could not understand the audio. Please try again.')
        this.setPhase('idle')
        return
      }
      const now = Date.now()
      if (now - this.lastTranscriptAt < 400) {
        console.warn('[nyven-stt] suppressed duplicate transcript within 400ms')
        this.setPhase('idle')
        return
      }
      this.lastTranscriptAt = now
      this.handlers.onTranscript?.(text)
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
      this.sttInFlight = false
      this.sttAbort = null
    }
  }

  /**
   * Speak via existing OpenRouter Sua TTS.
   * Resolves only after successful playback ends.
   * Rejects on TTS/playback failure so callers (Chat) do not reopen the mic.
   * @param opts.force — voice conversation: ignore typed-chat autoSpeak/enabled prefs
   */
  async speak(text: string, opts?: { force?: boolean }): Promise<void> {
    const prefs = getVoicePreferences()
    if (!opts?.force) {
      if (!prefs.enabled || !prefs.autoSpeak) return
    }
    if (!text.trim()) return

    this.stopSpeaking()
    this.ttsAbort = new AbortController()
    try {
      const blob = await fetchTTS(text, prefs.voiceId, this.ttsAbort.signal)
      await this.playback.play(blob)
      // play() resolved ⇒ audio actually finished
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        this.setPhase('idle')
        // Propagate abort so Chat does not treat it as successful speech
        throw err
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Could not play speech. The text response is still available.'
      this.handlers.onError?.(message)
      this.setPhase('idle')
      // Re-throw so Chat only reopens the mic after real success
      throw err instanceof Error ? err : new Error(message)
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

  stopAll(): void {
    this.listenMode = false
    this.sttAbort?.abort()
    this.sttAbort = null
    this.recorder.cancel()
    this.stopSpeaking()
    this.setPhase('idle')
  }
}
