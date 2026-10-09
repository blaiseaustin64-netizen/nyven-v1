/**
 * Single-voice playback — sound is mandatory; analyser is optional.
 *
 * Rule: once createMediaElementSource() is used, the element MUST stay
 * connected to ctx.destination (context running) or it will be silent.
 * Analyser is a parallel tap only; it is never required for sound.
 */

export type PlaybackHandlers = {
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
  onEnergy?: (level: number) => void
}

export class SpeechPlayback {
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private handlers: PlaybackHandlers = {}
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private raf = 0
  private playGeneration = 0
  /** True if current element is routed through Web Audio */
  private usingGraph = false

  setHandlers(h: PlaybackHandlers) {
    this.handlers = h
  }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioContext()
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume()
      }
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.02)
    } catch {
      /* best-effort */
    }
  }

  private async ensureContextRunning(): Promise<boolean> {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioContext()
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume()
      }
      return this.ctx.state === 'running'
    } catch {
      return false
    }
  }

  /**
   * Wire MediaElementSource only when context is running.
   * Always connect source → destination first (sound path).
   * Analyser is optional parallel tap; failure leaves destination connected.
   * Returns true if graph routing is active.
   */
  private tryWireGraph(audio: HTMLAudioElement): boolean {
    if (!this.ctx || this.ctx.state !== 'running') return false
    try {
      this.sourceNode = this.ctx.createMediaElementSource(audio)
      // Sound path first — never leave source disconnected
      this.sourceNode.connect(this.ctx.destination)
      try {
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 256
        // Metering only; does not replace destination connection
        this.sourceNode.connect(this.analyser)
        this.startEnergyLoop()
      } catch {
        this.analyser = null
        // Destination connection remains — audio still plays
      }
      return true
    } catch {
      this.sourceNode = null
      this.analyser = null
      return false
    }
  }

  async play(blob: Blob): Promise<void> {
    if (!blob || blob.size === 0) {
      const err = new Error('TTS returned empty audio.')
      this.handlers.onError?.(err.message)
      throw err
    }

    this.stopPlaybackElements()
    this.teardownGraphKeepContext()
    const gen = ++this.playGeneration

    this.objectUrl = URL.createObjectURL(blob)
    const audio = new Audio()
    this.audio = audio
    audio.preload = 'auto'
    audio.src = this.objectUrl

    const running = await this.ensureContextRunning()
    this.usingGraph = running ? this.tryWireGraph(audio) : false

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const settleOk = () => {
        if (settled || gen !== this.playGeneration) return
        settled = true
        this.stopEnergyLoop()
        this.teardownGraphKeepContext()
        this.cleanupUrl()
        this.audio = null
        this.usingGraph = false
        this.handlers.onEnd?.()
        resolve()
      }
      const settleErr = (msg: string) => {
        if (settled || gen !== this.playGeneration) return
        settled = true
        this.stopEnergyLoop()
        this.teardownGraphKeepContext()
        this.cleanupUrl()
        this.audio = null
        this.usingGraph = false
        this.handlers.onError?.(msg)
        this.handlers.onEnd?.()
        reject(new Error(msg))
      }

      audio.onended = () => settleOk()
      audio.onerror = () => settleErr('Playback failed.')

      void (async () => {
        try {
          // Re-resume in case iOS suspended between wire and play
          if (this.usingGraph) {
            const ok = await this.ensureContextRunning()
            if (!ok && this.sourceNode && this.ctx) {
              // Try one more resume; if still not running, audio may be silent
              try {
                await this.ctx.resume()
              } catch {
                /* ignore */
              }
            }
            // Ensure destination connection still exists after any teardown race
            if (this.sourceNode && this.ctx && this.ctx.state === 'running') {
              try {
                this.sourceNode.connect(this.ctx.destination)
              } catch {
                /* already connected */
              }
            }
          }

          if (gen !== this.playGeneration) return
          await audio.play()
          if (gen !== this.playGeneration) return
          this.handlers.onStart?.()
        } catch {
          settleErr(
            'Could not play audio. Tap the mic again or check browser autoplay settings.'
          )
        }
      })()
    })
  }

  stop(): void {
    this.playGeneration++
    this.stopPlaybackElements()
    this.stopEnergyLoop()
    this.teardownGraphKeepContext()
    this.cleanupUrl()
    this.usingGraph = false
    this.handlers.onEnergy?.(0)
  }

  isPlaying(): boolean {
    return !!this.audio && !this.audio.paused
  }

  private stopPlaybackElements() {
    if (this.audio) {
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.onplay = null
      try {
        this.audio.pause()
        this.audio.removeAttribute('src')
        this.audio.load()
      } catch {
        /* ignore */
      }
    }
    this.audio = null
  }

  private cleanupUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  private startEnergyLoop() {
    this.stopEnergyLoop()
    if (!this.analyser) return
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
  }

  private stopEnergyLoop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.handlers.onEnergy?.(0)
  }

  private teardownGraphKeepContext() {
    try {
      this.sourceNode?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.analyser?.disconnect()
    } catch {
      /* ignore */
    }
    this.sourceNode = null
    this.analyser = null
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
    const msg =
      (data as { error?: string }).error ||
      `Could not generate speech (HTTP ${res.status}).`
    throw new Error(msg)
  }
  const blob = await res.blob()
  if (!blob.size) {
    throw new Error('TTS returned empty audio.')
  }
  return blob
}

export async function fetchSTT(
  blob: Blob,
  signal?: AbortSignal
): Promise<string> {
  const form = new FormData()
  const extension = blob.type.split('/')[1]?.split(';')[0] || 'webm'
  const normalizedExtension =
    extension === 'x-m4a' ? 'mp4' : extension === 'mpeg' ? 'mp3' : extension
  form.append('audio', blob, `recording.${normalizedExtension}`)

  if (import.meta.env.DEV) {
    console.info('[nyven-stt]', {
      mime: blob.type || 'unknown',
      bytes: blob.size,
      name: `recording.${normalizedExtension}`,
    })
  }

  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    body: form,
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean
    error?: string
    text?: string
    providerStatus?: number
    providerDetail?: string
    code?: string
  }
  if (!res.ok || !data.success) {
    const base = data.error || 'Speech recognition failed.'
    const extra =
      data.providerStatus != null
        ? ` [provider ${data.providerStatus}${data.providerDetail ? `: ${data.providerDetail}` : ''}]`
        : data.code
          ? ` [${data.code}]`
          : ''
    throw new Error(base + extra)
  }
  const text = String(data.text || '').trim()
  if (import.meta.env.DEV) {
    console.info('[nyven-stt]', { transcriptChars: text.length })
  }
  return text
}
