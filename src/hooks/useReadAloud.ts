import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTTS } from '../lib/voice/playback'
import { getVoicePreferences } from '../lib/voice/preferences'

export type ReadAloudState = {
  messageId: string | null
  playing: boolean
  loading: boolean
  rate: number
  elapsed: number
  /** Total seconds when known from audio element */
  duration: number
  error?: string | null
}

const RATES = [1, 1.25, 1.5, 2, 0.75]

/**
 * Shared read-aloud via backend POST /api/voice/tts (Fish Audio).
 * No browser speechSynthesis fallback.
 */
export function useReadAloud() {
  const [state, setState] = useState<ReadAloudState>({
    messageId: null,
    playing: false,
    loading: false,
    rate: 1,
    elapsed: 0,
    duration: 0,
    error: null,
  })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  /** Cache generated audio per messageId (object URLs). */
  const cacheRef = useRef<Map<string, string>>(new Map())
  const rateRef = useRef(1)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const teardownAudio = useCallback((revokeCurrent = true) => {
    clearTimer()
    const a = audioRef.current
    if (a) {
      try {
        a.onended = null
        a.onerror = null
        a.ontimeupdate = null
        a.pause()
        a.removeAttribute('src')
        a.load()
      } catch {
        /* */
      }
      audioRef.current = null
    }
    if (revokeCurrent && objectUrlRef.current) {
      // Do not revoke if still in cache
      let inCache = false
      for (const url of cacheRef.current.values()) {
        if (url === objectUrlRef.current) {
          inCache = true
          break
        }
      }
      if (!inCache) {
        try {
          URL.revokeObjectURL(objectUrlRef.current)
        } catch {
          /* */
        }
      }
      objectUrlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    teardownAudio(false)
    setState((s) => ({
      ...s,
      playing: false,
      loading: false,
      messageId: null,
      elapsed: 0,
      duration: 0,
      error: null,
    }))
  }, [teardownAudio])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      teardownAudio(true)
      for (const url of cacheRef.current.values()) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* */
        }
      }
      cacheRef.current.clear()
    }
  }, [teardownAudio])

  const attachAndPlay = useCallback(
    (messageId: string, url: string, rate: number) => {
      teardownAudio(false)
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = url
      audio.playbackRate = rate
      audioRef.current = audio
      objectUrlRef.current = url

      audio.onended = () => {
        clearTimer()
        setState((s) =>
          s.messageId === messageId
            ? { ...s, playing: false, loading: false, elapsed: 0 }
            : s
        )
      }
      audio.onerror = () => {
        clearTimer()
        setState((s) =>
          s.messageId === messageId
            ? {
                ...s,
                playing: false,
                loading: false,
                error: 'Could not play audio.',
              }
            : s
        )
      }
      audio.onloadedmetadata = () => {
        const d = Number.isFinite(audio.duration) ? audio.duration : 0
        setState((s) =>
          s.messageId === messageId ? { ...s, duration: d } : s
        )
      }
      audio.ontimeupdate = () => {
        setState((s) =>
          s.messageId === messageId
            ? {
                ...s,
                elapsed: Math.floor(audio.currentTime),
                duration:
                  Number.isFinite(audio.duration) && audio.duration > 0
                    ? audio.duration
                    : s.duration,
              }
            : s
        )
      }

      const p = audio.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setState((s) =>
            s.messageId === messageId
              ? { ...s, loading: false, playing: true, error: null }
              : s
          )
        }).catch(() => {
          setState((s) =>
            s.messageId === messageId
              ? {
                  ...s,
                  loading: false,
                  playing: false,
                  error: 'Playback was blocked. Tap play again.',
                }
              : s
          )
        })
      } else {
        setState((s) =>
          s.messageId === messageId
            ? { ...s, loading: false, playing: true, error: null }
            : s
        )
      }
    },
    [teardownAudio]
  )

  const play = useCallback(
    (messageId: string, content: string) => {
      const text = (content || '').trim()
      if (!text) return

      // Cancel any in-flight request / audio
      abortRef.current?.abort()
      teardownAudio(false)

      const rate = rateRef.current
      setState({
        messageId,
        playing: false,
        loading: true,
        rate,
        elapsed: 0,
        duration: 0,
        error: null,
      })

      const cached = cacheRef.current.get(messageId)
      if (cached) {
        attachAndPlay(messageId, cached, rate)
        return
      }

      const ac = new AbortController()
      abortRef.current = ac
      const voiceId = getVoicePreferences().voiceId

      void (async () => {
        try {
          const blob = await fetchTTS(text.slice(0, 12000), voiceId, ac.signal)
          if (ac.signal.aborted) return
          const url = URL.createObjectURL(blob)
          cacheRef.current.set(messageId, url)
          // Cap cache size
          if (cacheRef.current.size > 12) {
            const first = cacheRef.current.keys().next().value
            if (first && first !== messageId) {
              const old = cacheRef.current.get(first)
              cacheRef.current.delete(first)
              if (old) {
                try {
                  URL.revokeObjectURL(old)
                } catch {
                  /* */
                }
              }
            }
          }
          attachAndPlay(messageId, url, rate)
        } catch (e) {
          if (ac.signal.aborted) return
          const msg = e instanceof Error ? e.message : 'Could not generate speech.'
          setState((s) =>
            s.messageId === messageId
              ? { ...s, loading: false, playing: false, error: msg }
              : s
          )
        }
      })()
    },
    [attachAndPlay, teardownAudio]
  )

  const togglePause = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      void a.play().then(() => setState((s) => ({ ...s, playing: true }))).catch(() => {})
    } else {
      a.pause()
      setState((s) => ({ ...s, playing: false }))
    }
  }, [])

  const cycleRate = useCallback(() => {
    setState((s) => {
      const idx = RATES.indexOf(s.rate)
      const next = RATES[(idx + 1) % RATES.length]
      rateRef.current = next
      if (audioRef.current) audioRef.current.playbackRate = next
      return { ...s, rate: next }
    })
  }, [])

  const seek = useCallback((deltaSec: number) => {
    const a = audioRef.current
    if (!a || !Number.isFinite(a.duration)) {
      setState((s) => ({ ...s, elapsed: Math.max(0, s.elapsed + deltaSec) }))
      return
    }
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + deltaSec))
    setState((s) => ({ ...s, elapsed: Math.floor(a.currentTime) }))
  }, [])

  return {
    state,
    play,
    stop,
    togglePause,
    cycleRate,
    seek,
    isReading: (id: string) => state.messageId === id && (state.playing || state.loading),
    isLoading: (id: string) => state.messageId === id && state.loading,
  }
}
