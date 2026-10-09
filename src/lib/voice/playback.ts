/**
 * Speech playback — prefer decoded AudioBuffer for smooth, natural rate.
 *
 * Why: MediaElementSource + HTMLAudioElement can resample/jitter on some
 * mobile browsers (choppy or strained delivery). decodeAudioData +
 * BufferSource plays at the file's native rate through a running AudioContext.
 *
 * Analyser remains a parallel tap for the liquid visualizer; sound always
 * routes source → destination first.
 */

export type PlaybackHandlers = {
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
  onEnergy?: (level: number) => void
}

export class SpeechPlayback {
  private handlers: PlaybackHandlers = {}
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private bufferSource: AudioBufferSourceNode | null = null
  private mediaElement: HTMLAudioElement | null = null
  private mediaSource: MediaElementAudioSourceNode | null = null
  private objectUrl: string | null = null
  private raf = 0
  private playGeneration = 0
  private gain: GainNode | null = null

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

  private stopEnergyLoop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.handlers.onEnergy?.(0)
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

  private teardownNodes() {
    try {
      this.bufferSource?.stop()
    } catch {
      /* ignore */
    }
    try {
      this.bufferSource?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.mediaSource?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.analyser?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.gain?.disconnect()
    } catch {
      /* ignore */
    }
    this.bufferSource = null
    this.mediaSource = null
    this.analyser = null
    this.gain = null
    if (this.mediaElement) {
      try {
        this.mediaElement.onended = null
        this.mediaElement.onerror = null
        this.mediaElement.pause()
        this.mediaElement.removeAttribute('src')
        this.mediaElement.load()
      } catch {
        /* ignore */
      }
      this.mediaElement = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  /**
   * Play TTS audio. Prefer AudioBuffer path (smooth rate). Fallback to HTMLAudioElement.
   * Always forces a correct audio MIME type so the decoder does not mis-parse.
   */
  async play(blob: Blob): Promise<void> {
    if (!blob || blob.size === 0) {
      const err = new Error('TTS returned empty audio.')
      this.handlers.onError?.(err.message)
      throw err
    }

    this.playGeneration++
    const gen = this.playGeneration
    this.teardownNodes()
    this.stopEnergyLoop()

    // Normalize MIME — server should send audio/mpeg; some proxies strip type
    const mime =
      blob.type && blob.type.startsWith('audio/')
        ? blob.type
        : 'audio/mpeg'
    const typedBlob = blob.type === mime ? blob : new Blob([await blob.arrayBuffer()], { type: mime })
    const arrayBuffer = await typedBlob.arrayBuffer()

    const running = await this.ensureContextRunning()
    if (running && this.ctx) {
      try {
        // Copy buffer — decodeAudioData may detach the original
        const copy = arrayBuffer.slice(0)
        const audioBuffer = await this.ctx.decodeAudioData(copy)
        if (gen !== this.playGeneration) return

        this.gain = this.ctx.createGain()
        this.gain.gain.value = 1
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 256

        this.bufferSource = this.ctx.createBufferSource()
        this.bufferSource.buffer = audioBuffer
        this.bufferSource.playbackRate.value = 1

        // Sound path: source → gain → destination
        this.bufferSource.connect(this.gain)
        this.gain.connect(this.ctx.destination)
        // Metering tap
        this.gain.connect(this.analyser)

        return new Promise<void>((resolve, reject) => {
          let settled = false
          const ok = () => {
            if (settled || gen !== this.playGeneration) return
            settled = true
            this.stopEnergyLoop()
            this.teardownNodes()
            this.handlers.onEnd?.()
            resolve()
          }
          const fail = (msg: string) => {
            if (settled || gen !== this.playGeneration) return
            settled = true
            this.stopEnergyLoop()
            this.teardownNodes()
            this.handlers.onError?.(msg)
            this.handlers.onEnd?.()
            reject(new Error(msg))
          }

          this.bufferSource!.onended = () => ok()
          try {
            this.bufferSource!.start(0)
            this.handlers.onStart?.()
            this.startEnergyLoop()
          } catch {
            fail('Could not play audio.')
          }
        })
      } catch {
        // Fall through to element path
      }
    }

    // Fallback: HTMLAudioElement (native decode)
    return this.playViaElement(typedBlob, gen)
  }

  private playViaElement(blob: Blob, gen: number): Promise<void> {
    this.objectUrl = URL.createObjectURL(blob)
    const audio = new Audio()
    this.mediaElement = audio
    audio.preload = 'auto'
    audio.playbackRate = 1
    audio.src = this.objectUrl

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const ok = () => {
        if (settled || gen !== this.playGeneration) return
        settled = true
        this.stopEnergyLoop()
        this.teardownNodes()
        this.handlers.onEnd?.()
        resolve()
      }
      const fail = (msg: string) => {
        if (settled || gen !== this.playGeneration) return
        settled = true
        this.stopEnergyLoop()
        this.teardownNodes()
        this.handlers.onError?.(msg)
        this.handlers.onEnd?.()
        reject(new Error(msg))
      }

      audio.onended = () => ok()
      audio.onerror = () => fail('Playback failed.')

      void (async () => {
        const running = await this.ensureContextRunning()
        if (gen !== this.playGeneration) return
        if (running && this.ctx) {
          try {
            this.mediaSource = this.ctx.createMediaElementSource(audio)
            this.mediaSource.connect(this.ctx.destination)
            try {
              this.analyser = this.ctx.createAnalyser()
              this.analyser.fftSize = 256
              this.mediaSource.connect(this.analyser)
              this.startEnergyLoop()
            } catch {
              this.analyser = null
            }
          } catch {
            this.mediaSource = null
          }
        }
        try {
          await audio.play()
          if (gen !== this.playGeneration) return
          this.handlers.onStart?.()
        } catch {
          fail(
            'Could not play audio. Tap the mic again or check browser autoplay settings.'
          )
        }
      })()
    })
  }

  stop(): void {
    this.playGeneration++
    this.stopEnergyLoop()
    this.teardownNodes()
    this.handlers.onEnergy?.(0)
  }

  isPlaying(): boolean {
    if (this.bufferSource) return true
    return !!this.mediaElement && !this.mediaElement.paused
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
  const raw = await res.arrayBuffer()
  if (!raw.byteLength) {
    throw new Error('TTS returned empty audio.')
  }
  // Force MPEG type so decodeAudioData / <audio> do not mis-detect
  const contentType = res.headers.get('content-type') || 'audio/mpeg'
  const mime = contentType.includes('mpeg') || contentType.includes('mp3')
    ? 'audio/mpeg'
    : contentType.startsWith('audio/')
      ? contentType.split(';')[0].trim()
      : 'audio/mpeg'
  return new Blob([raw], { type: mime })
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
