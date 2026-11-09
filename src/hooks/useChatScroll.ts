import { useCallback, useMemo, useRef, useState } from 'react'

/** Stick-to-bottom + jump-to-latest. Stable callbacks; never forces scroll when user scrolled up. */
export function useChatScroll() {
  const stickToBottomRef = useRef(true)
  const [showJumpLatest, setShowJumpLatest] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((force = false, smooth = false) => {
    if (!force && !stickToBottomRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    setShowJumpLatest(false)
  }, [])

  const onChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = dist < 120
    stickToBottomRef.current = nearBottom
    setShowJumpLatest(!nearBottom && el.scrollHeight > el.clientHeight + 40)
  }, [])

  // Stable object identity so effects can depend on the hook return safely
  return useMemo(
    () => ({
      stickToBottomRef,
      showJumpLatest,
      setShowJumpLatest,
      bottomRef,
      scrollRef,
      scrollToBottom,
      onChatScroll,
    }),
    [showJumpLatest, scrollToBottom, onChatScroll]
  )
}
