import { useCallback, useRef, useState } from 'react'

/**
 * Hide chrome after scrolling down ~24px past top; show on scroll up or at top.
 * Attach onScroll to the message list container (not window).
 */
export function useHideOnScroll(threshold = 24) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const y = e.currentTarget.scrollTop
      if (y <= threshold) {
        setHidden(false)
      } else if (y > lastY.current + 4) {
        setHidden(true)
      } else if (y < lastY.current - 4) {
        setHidden(false)
      }
      lastY.current = y
    },
    [threshold]
  )

  return { hidden, onScroll, setHidden }
}
