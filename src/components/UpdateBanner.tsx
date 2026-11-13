import { useEffect, useState } from 'react'

/** Shown when a new service worker is waiting. */
export function UpdateBanner() {
  const [show, setShow] = useState(false)
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let reg: ServiceWorkerRegistration | null = null

    const onUpdateFound = () => {
      const sw = reg?.installing
      if (!sw) return
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(sw)
          setShow(true)
        }
      })
    }

    navigator.serviceWorker.getRegistration().then((r) => {
      if (!r) return
      reg = r
      if (r.waiting) {
        setWaiting(r.waiting)
        setShow(true)
      }
      r.addEventListener('updatefound', onUpdateFound)
    })

    const onControllerChange = () => {
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={() => {
        waiting?.postMessage({ type: 'SKIP_WAITING' })
        // Fallback reload if worker already activated
        setTimeout(() => window.location.reload(), 400)
      }}
      className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full
        bg-[var(--nyven-surface)]/95 border border-[var(--nyven-border)] backdrop-blur-xl
        text-[13px] font-medium text-[var(--nyven-text)] shadow-lg
        hover:border-[var(--nyven-cyan)]/40"
    >
      Update available — tap to refresh
    </button>
  )
}
