import { useEffect, useState } from 'react'

/**
 * True when the on-screen keyboard is likely open (visualViewport shrinks).
 * Used to hide the mobile bottom nav so it does not sit above the keyboard.
 */
export function useKeyboardOpen(thresholdPx = 120): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const keyboardLikely = window.innerHeight - vv.height > thresholdPx
      setOpen(keyboardLikely)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [thresholdPx])

  return open
}
