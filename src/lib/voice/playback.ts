/**
 * Single-voice playback controller — no overlapping assistant speech.
 * Speaking state driven by real audio element events (not timers).
 */

export type PlaybackHandlers = {
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
  /** 0–1 energy from analyser while playing */
  onEnergy?: (level: number) => void
}

export class SpeechPlayback {
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private handlers: PlaybackHandlers = {}
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private raf = 0
  private sourceNode: MediaElementAudioSourceNode | null = null

  setHandlers(h: PlaybackHandlers) {
    this.handlers = h
  }

  async play(blob: Blob): Promise<void> {
    this.stop()
    this.objectUrl = URL.createObjectURL(blob)
    this.audio = new Audio(this.objectUrl)
    this.audio.preload = 'auto'

    this.audio.onplay = () => {
      this.handlers.onStart?.()
      this.startAnalyser()
    }
    this.audio.onended = () => {
      this.stopAnalyser()
      this.cleanupUrl()
      this.handlers.onEnd?.()
    }
    this.audio.onerror = () => {
      this.stopAnalyser()
      this.cleanupUrl()
      this.handlers.onError?.('Playback failed.')
      this.handlers.onEnd?.()
    }

    try {
      // Mobile: resume AudioContext on user gesture path when possible
      await this.audio.play()
    } catch (err) {
      this.stopAnalyser()
      this.cleanupUrl()
      this.handlers.onError?.(
        'Could not play audio. Tap again or check browser autoplay settings.'
      )
      this.handlers.onEnd?.()
      throw err
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.onplay = null
      try {
        this.audio.pause()
        this.audio.src = ''
      } catch {
        /* ignore */
      }
    }
    this.audio = null
    this.stopAnalyser()
    this.cleanupUrl()
  }

  isPlaying(): boolean {
    return !!this.audio && !this.audio.paused
  }

  private cleanupUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  private startAnalyser() {
    if (!this.audio) return
    try {
      this.ctx = new AudioContext()
      this.sourceNode = this.ctx.createMediaElementSource(this.audio)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.sourceNode.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
      const data = new Uint8Array(this.analyser.frequencyBinCount)
      const tick = () => {
        if (!this.analyser) return
        this.analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / (data.length * 255)
        this.handlers.onEnergy?.(Math.min(1, avg * 1.8))
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    } catch {
      /* analyser optional; audio still plays */
    }
  }

  private stopAnalyser() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.analyser = null
    this.sourceNode = null
    void this.ctx?.close()
    this.ctx = null
    this.handlers.onEnergy?.(0)
  }
}

export async function fetchTTS(
  text: string,
  voiceId: string,
  signal?: AbortSignal
): Promise<Blob> {
  const res = await fetch('/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || 'Could not generate speech.'
    )
  }
  return res.blob()
}

export async function fetchSTT(
  blob: Blob,
  signal?: AbortSignal
): Promise<string> {
  const form = new FormData()
  const extension = blob.type.split('/')[1]?.split(';')[0] || 'webm'
  const normalizedExtension = extension === 'x-m4a' ? 'mp4' : extension === 'mpeg' ? 'mp3' : extension
  form.append('audio', blob, `recording.${normalizedExtension}`)
  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    body: form,
    signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !(data as { success?: boolean }).success) {
    throw new Error(
      (data as { error?: string }).error || 'Speech recognition failed.'
    )
  }
  return String((data as { text?: string }).text || '').trim()
}
