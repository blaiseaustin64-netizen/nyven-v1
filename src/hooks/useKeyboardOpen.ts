import { useEffect, useState } from 'react'
export function useKeyboardOpen(thresholdPx = 120): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    const update = () => {
      const height = vv ? vv.height : window.innerHeight
      document.documentElement.style.setProperty('--app-vh', `${height}px`)
      if (vv) setOpen(window.innerHeight - vv.height > thresholdPx)
    }
    update()
    if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update) }
    window.addEventListener('resize', update)
    return () => {
      if (vv) { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
      window.removeEventListener('resize', update)
    }
  }, [thresholdPx])
  return open
}
