import { useCallback, useEffect, useRef, useState } from 'react'

export type ReadAloudState = {
  messageId: string | null
  playing: boolean
  loading: boolean
  rate: number
  elapsed: number
}

const RATES = [1, 1.25, 1.5, 2, 0.75]

/**
 * Shared read-aloud: starts on user tap, mini-player state, single active.
 * Uses Web Speech API when available (no provider names in UI).
 */
export function useReadAloud() {
  const [state, setState] = useState<ReadAloudState>({
    messageId: null,
    playing: false,
    loading: false,
    rate: 1,
    elapsed: 0,
  })
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)
  const timerRef = useRef<number | null>(null)
  const startTs = useRef(0)
  const textRef = useRef('')

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* */
    }
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    utterRef.current = null
    setState((s) => ({ ...s, playing: false, loading: false, messageId: null, elapsed: 0 }))
  }, [])

  useEffect(() => () => stop(), [stop])

  const play = useCallback(
    (messageId: string, content: string) => {
      // Must call inside tap handler
      stop()
      const text = (content || '').trim()
      if (!text) return
      textRef.current = text
      setState({ messageId, playing: true, loading: true, rate: 1, elapsed: 0 })
      startTs.current = Date.now()

      if (typeof window === 'undefined' || !window.speechSynthesis) {
        setState((s) => ({ ...s, loading: false, playing: false }))
        return
      }

      const u = new SpeechSynthesisUtterance(text.slice(0, 12000))
      u.rate = 1
      utterRef.current = u
      u.onstart = () => {
        setState((s) => ({ ...s, loading: false, playing: true }))
        timerRef.current = window.setInterval(() => {
          setState((s) => ({
            ...s,
            elapsed: Math.floor((Date.now() - startTs.current) / 1000),
          }))
        }, 250)
      }
      u.onend = () => stop()
      u.onerror = () => stop()
      window.speechSynthesis.speak(u)
    },
    [stop]
  )

  const togglePause = useCallback(() => {
    if (!window.speechSynthesis) return
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
      setState((s) => ({ ...s, playing: true }))
    } else {
      window.speechSynthesis.pause()
      setState((s) => ({ ...s, playing: false }))
    }
  }, [])

  const cycleRate = useCallback(() => {
    setState((s) => {
      const idx = RATES.indexOf(s.rate)
      const next = RATES[(idx + 1) % RATES.length]
      if (utterRef.current) utterRef.current.rate = next
      // Restart at new rate for broader browser support
      if (s.messageId && textRef.current) {
        const id = s.messageId
        const text = textRef.current
        setTimeout(() => play(id, text), 0)
      }
      return { ...s, rate: next }
    })
  }, [play])

  const seek = useCallback((deltaSec: number) => {
    // SpeechSynthesis has limited seek — approximate by elapsed display only
    setState((s) => ({ ...s, elapsed: Math.max(0, s.elapsed + deltaSec) }))
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
