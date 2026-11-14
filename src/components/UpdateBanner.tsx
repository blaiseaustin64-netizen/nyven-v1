import { useEffect, useRef, useState } from 'react'

/**
 * Shown when a new version of the app has been downloaded and is waiting.
 * Refresh tells the waiting service worker to take over (SKIP_WAITING) and reloads.
 * Nothing reloads on its own, so a chat in progress is never interrupted.
 */
export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [updating, setUpdating] = useState(false)
  const refreshingRef = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false
    let reg: ServiceWorkerRegistration | null = null

    const track = (sw: ServiceWorker | null) => {
      if (!sw) return
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw)
      })
    }
    const onUpdateFound = () => track(reg?.installing ?? null)

    void navigator.serviceWorker.ready.then((r) => {
      if (cancelled) return
      reg = r
      if (r.waiting) setWaiting(r.waiting)
      track(r.installing)
      r.addEventListener('updatefound', onUpdateFound)
    })

    // Only reload after the person tapped Refresh (not on the very first install).
    const onControllerChange = () => {
      if (refreshingRef.current) window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      cancelled = true
      reg?.removeEventListener('updatefound', onUpdateFound)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waiting) return null

  const refresh = () => {
    refreshingRef.current = true
    setUpdating(true)
    waiting.postMessage({ type: 'SKIP_WAITING' })
    // Fallback in case no controllerchange arrives (worker was already active)
    window.setTimeout(() => window.location.reload(), 1500)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[90] w-[min(92vw,26rem)] animate-fade-in
        flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl border border-[var(--nyven-border)]
        bg-nyven-surface/95 backdrop-blur-xl shadow-lg shadow-nyven-shade/60"
    >
      <span className="w-2 h-2 rounded-full bg-nyven-cyan shrink-0" aria-hidden />
      <p className="flex-1 min-w-0 text-[13px] text-[var(--nyven-text)]">A new version of NYVEN is ready</p>
      <button
        type="button"
        onClick={refresh}
        disabled={updating}
        className="shrink-0 px-4 min-h-[40px] rounded-xl text-[13px] font-semibold bg-[var(--nyven-cyan)] text-[var(--nyven-on-accent)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70"
      >
        {updating ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  )
}
