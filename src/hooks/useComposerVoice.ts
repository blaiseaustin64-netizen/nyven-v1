/**
 * Shared voice wiring for MessageComposer + VoiceChatScreen.
 * Used by normal Chat and Project workspace.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceController, type VoicePhase } from '../lib/voice/controller'
import type { ComposerSendPayload } from '../components/MessageComposer'

type SendFn = (
  payload: ComposerSendPayload | string,
  opts?: { fromVoice?: boolean }
) => Promise<void> | void

export function useComposerVoice(options?: {
  /** When generation is running, transcripts are ignored */
  isGenerating?: boolean
}) {
  const isGenerating = options?.isGenerating ?? false
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const [voiceEnergy, setVoiceEnergy] = useState(0)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceChatOpen, setVoiceChatOpen] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null)
  const [lastVoiceReply, setLastVoiceReply] = useState<string | null>(null)
  const [fromVoice, setFromVoice] = useState(false)

  const voiceRef = useRef<VoiceController | null>(null)
  const voiceChatOpenRef = useRef(false)
  const voiceMutedRef = useRef(false)
  const fromVoiceRef = useRef(false)
  const voiceSubmitInFlightRef = useRef(false)
  const voiceTurnRef = useRef(0)
  const isGeneratingRef = useRef(isGenerating)
  isGeneratingRef.current = isGenerating

  const handleSendRef = useRef<SendFn>(async () => {})

  const setSendHandler = useCallback((fn: SendFn) => {
    handleSendRef.current = fn
  }, [])

  useEffect(() => {
    const vc = new VoiceController()
    voiceRef.current = vc
    vc.setHandlers({
      onPhase: (phase) => {
        setVoicePhase(phase)
        if (phase === 'idle') setVoiceEnergy(0)
      },
      onListenLevel: (level) => setVoiceEnergy(level),
      onSpeakEnergy: (level) => setVoiceEnergy(level),
      onTranscript: (text) => {
        if (!text.trim()) return
        if (voiceSubmitInFlightRef.current || isGeneratingRef.current) return
        voiceTurnRef.current += 1
        fromVoiceRef.current = true
        voiceSubmitInFlightRef.current = true
        setFromVoice(true)
        setLastVoiceTranscript(text)
        void handleSendRef.current({ text, attachments: [] }, { fromVoice: true })
      },
      onError: (message) => {
        fromVoiceRef.current = false
        setFromVoice(false)
        setVoiceError(message)
        setTimeout(() => setVoiceError(null), 4000)
      },
    })
    return () => {
      vc.stopAll()
      voiceRef.current = null
    }
  }, [])

  const markVoiceSubmitDone = useCallback(() => {
    voiceSubmitInFlightRef.current = false
  }, [])

  const speakReply = useCallback(async (text: string) => {
    setLastVoiceReply(text)
    const replyTurn = voiceTurnRef.current
    if (fromVoiceRef.current || voiceChatOpenRef.current) {
      try {
        await voiceRef.current?.speak(text, { force: true })
      } catch {
        // An interrupted reply is expected during natural barge-in.
      }
      // If the user started another turn while this reply was speaking, do not
      // overwrite the new turn's state or start a second recorder.
      if (voiceTurnRef.current === replyTurn && voiceChatOpenRef.current && !voiceMutedRef.current) {
        void voiceRef.current?.toggleListen()
      }
    }
    if (voiceTurnRef.current === replyTurn) {
      fromVoiceRef.current = false
      setFromVoice(false)
      voiceSubmitInFlightRef.current = false
    }
  }, [])

  const openVoiceChat = useCallback(() => {
    voiceChatOpenRef.current = true
    voiceRef.current?.setAutoStopOnSilence(true)
    setVoiceChatOpen(true)
  }, [])

  const closeVoiceChat = useCallback(() => {
    voiceChatOpenRef.current = false
    setVoiceChatOpen(false)
    voiceRef.current?.setAutoStopOnSilence(false)
    voiceRef.current?.stopAll()
  }, [])

  const toggleMute = useCallback((next?: boolean) => {
    setVoiceMuted((prev) => {
      const v = typeof next === 'boolean' ? next : !prev
      voiceMutedRef.current = v
      if (v) voiceRef.current?.stopAll()
      return v
    })
  }, [])

  return {
    voicePhase,
    voiceEnergy,
    voiceError,
    voiceChatOpen,
    voiceMuted,
    lastVoiceTranscript,
    lastVoiceReply,
    fromVoice,
    fromVoiceRef,
    voiceRef,
    setSendHandler,
    markVoiceSubmitDone,
    speakReply,
    openVoiceChat,
    closeVoiceChat,
    toggleMute,
    setVoiceError,
    onVoiceToggle: () => void voiceRef.current?.toggleListen(),
  }
}
