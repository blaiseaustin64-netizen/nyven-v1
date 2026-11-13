import { useEffect, useState } from 'react'
import {
  type BeforeInstallPromptEvent,
  dismissInstall,
  getDeferredInstall,
  isStandalone,
  onDeferredInstall,
  shouldOfferInstall,
} from '../lib/pwa'

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallPrompt({ forceOpen = false, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => getDeferredInstall())
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const unsub = onDeferredInstall((e) => setDeferred(e))
    const check = () => {
      if (isStandalone()) return
      if (!shouldOfferInstall() && !forceOpen) return
      if (getDeferredInstall() || deferred) setOpen(true)
      else setGuide(true)
    }
    window.addEventListener('nyven-install-check', check)
    if (forceOpen) check()
    else if (shouldOfferInstall()) check()
    return () => {
      unsub()
      window.removeEventListener('nyven-install-check', check)
    }
  }, [deferred, forceOpen])

  if (isStandalone()) return null
  if (!open && !guide && !forceOpen) return null
  if (!open && !guide && forceOpen) {
    // show guide
  }

  const close = () => {
    dismissInstall(7)
    setOpen(false)
    setGuide(false)
    onClose?.()
  }

  const install = async () => {
    const ev = deferred || getDeferredInstall()
    if (!ev) {
      setGuide(true)
      setOpen(true)
      return
    }
    await ev.prompt()
    try {
      await ev.userChoice
    } catch {
      /* */
    }
    window.__nyvenDeferredInstall = null
    setDeferred(null)
    close()
  }

  const showGuide = guide || (!(deferred || getDeferredInstall()) && (open || forceOpen))

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)]/95 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] p-4">
        <div className="flex items-start gap-3">
          <img src="/nyven-icon-192.png" alt="" className="w-11 h-11 rounded-xl nyven-logo-adaptive" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-[var(--nyven-text)]">Install Nyven</p>
            <p className="text-[0.8125rem] text-[var(--nyven-text-secondary)] mt-0.5 leading-snug">
              {showGuide
                ? isIOS()
                  ? 'On iPhone: tap Share, then Add to Home Screen.'
                  : 'Open your browser menu → Install app / Add to Home Screen.'
                : 'Add Nyven to your home screen for a faster, app-like experience.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={close}
            className="flex-1 h-11 rounded-xl border border-[var(--nyven-border)] text-[var(--nyven-text-secondary)] text-sm font-medium"
          >
            Not now
          </button>
          {!showGuide && (
            <button
              type="button"
              onClick={() => void install()}
              className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[var(--nyven-on-accent)] text-sm font-semibold"
            >
              Install
            </button>
          )}
          {showGuide && (
            <button
              type="button"
              onClick={close}
              className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[var(--nyven-on-accent)] text-sm font-semibold"
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
