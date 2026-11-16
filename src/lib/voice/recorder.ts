/**
 * Microphone capture via MediaRecorder.
 * Audio is temporary — discarded after STT upload (not persisted).
 */

import { VOICE_LIMITS_CLIENT } from './limits'

export type RecorderError =
  | 'unsupported'
  | 'permission_denied'
  | 'no_device'
  | 'failed'

export type RecorderHandlers = {
  onStart?: () => void
  onStop?: (blob: Blob) => void
  onError?: (code: RecorderError, message: string) => void
  onLevel?: (level: number) => void
}

export class MicRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: BlobPart[] = []
  private maxTimer: ReturnType<typeof setTimeout> | null = null
  private analyser: AnalyserNode | null = null
  private audioCtx: AudioContext | null = null
  private raf = 0
  private speechDetected = false
  private lastSpeechAt = 0
  private silenceStopTimer: ReturnType<typeof setTimeout> | null = null
  private autoStopOnSilence = false
  private handlers: RecorderHandlers = {}

  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    )
  }

  setHandlers(h: RecorderHandlers) {
    this.handlers = h
  }

  async start(options?: { autoStopOnSilence?: boolean }): Promise<void> {
    if (!MicRecorder.isSupported()) {
      this.handlers.onError?.('unsupported', 'Voice input is not supported in this browser.')
      throw new Error('unsupported')
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.handlers.onError?.(
          'permission_denied',
          'Microphone permission was denied. Enable it in browser settings to use voice.'
        )
      } else if (name === 'NotFoundError') {
        this.handlers.onError?.('no_device', 'No microphone was found.')
      } else {
        this.handlers.onError?.('failed', 'Could not access the microphone.')
      }
      throw err
    }

    const mime = pickMime()
    try {
      this.recorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream)
    } catch {
      this.recorder = new MediaRecorder(this.stream)
    }

    this.autoStopOnSilence = Boolean(options?.autoStopOnSilence)
    this.chunks = []
    this.speechDetected = false
    this.lastSpeechAt = 0
    if (this.silenceStopTimer) {
      clearTimeout(this.silenceStopTimer)
      this.silenceStopTimer = null
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => {
      const type = this.recorder?.mimeType || mime || 'audio/webm'
      const blob = new Blob(this.chunks, { type })
      this.teardownStream()
      this.handlers.onStop?.(blob)
    }

    this.setupLevelMeter(this.stream)
    this.recorder.start(250)
    this.handlers.onStart?.()

    this.maxTimer = setTimeout(() => {
      void this.stop()
    }, VOICE_LIMITS_CLIENT.MAX_RECORDING_MS)
  }

  async stop(): Promise<void> {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
    if (this.silenceStopTimer) {
      clearTimeout(this.silenceStopTimer)
      this.silenceStopTimer = null
    }
    this.stopLevelMeter()
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop()
    } else {
      this.teardownStream()
    }
  }

  cancel(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
    if (this.silenceStopTimer) {
      clearTimeout(this.silenceStopTimer)
      this.silenceStopTimer = null
    }
    this.stopLevelMeter()
    this.chunks = []
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      try {
        this.recorder.stop()
      } catch {
        /* ignore */
      }
    }
    this.teardownStream()
  }

  private teardownStream() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
  }

  private setupLevelMeter(stream: MediaStream) {
    try {
      this.audioCtx = new AudioContext()
      const source = this.audioCtx.createMediaStreamSource(stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 256
      source.connect(this.analyser)
      const data = new Uint8Array(this.analyser.frequencyBinCount)
      const tick = () => {
        if (!this.analyser) return
        this.analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        const level = Math.min(1, rms * 3)
        this.handlers.onLevel?.(level)

        // Natural turn-taking for full-screen voice chat: once speech is detected,
        // a short quiet pause ends the turn so STT can start immediately.
        // Keep this conservative so normal pauses inside a sentence are preserved.
        const now = performance.now()
        if (this.autoStopOnSilence && level >= 0.045) {
          this.speechDetected = true
          this.lastSpeechAt = now
        } else if (this.autoStopOnSilence && this.speechDetected && this.lastSpeechAt && now - this.lastSpeechAt >= 1100) {
          if (!this.silenceStopTimer) {
            this.silenceStopTimer = setTimeout(() => {
              this.silenceStopTimer = null
              void this.stop()
            }, 40)
          }
        }
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    } catch {
      /* level optional */
    }
  }

  private stopLevelMeter() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.analyser = null
    void this.audioCtx?.close()
    this.audioCtx = null
  }
}

function pickMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c
  }
  return undefined
}
