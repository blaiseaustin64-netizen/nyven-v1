import { useEffect, useState } from 'react'
import {
  type BeforeInstallPromptEvent,
  dismissInstall,
  isStandalone,
  shouldOfferInstall,
} from '../lib/pwa'

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      if (shouldOfferInstall()) setOpen(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    // After some chat turns, maybe show iOS guide
    const t = window.setInterval(() => {
      if (isStandalone()) return
      if (!shouldOfferInstall()) return
      if (isIOS()) setIosGuide(true)
      else if (deferred) setOpen(true)
    }, 4000)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.clearInterval(t)
    }
  }, [deferred])

  if (isStandalone()) return null
  if (!open && !iosGuide) return null

  const close = () => {
    dismissInstall(7)
    setOpen(false)
    setIosGuide(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    try {
      await deferred.userChoice
    } catch {
      /* */
    }
    setDeferred(null)
    close()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)]/95 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] p-4">
        <div className="flex items-start gap-3">
          <img src="/nyven-icon-192.png" alt="" className="w-11 h-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--nyven-text)]">Install Nyven</p>
            <p className="text-[13px] text-[var(--nyven-text-secondary)] mt-0.5 leading-snug">
              {iosGuide
                ? 'On iPhone: tap Share, then Add to Home Screen.'
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
          {!iosGuide && deferred && (
            <button
              type="button"
              onClick={() => void install()}
              className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[#071018] text-sm font-semibold"
            >
              Install
            </button>
          )}
          {iosGuide && (
            <button
              type="button"
              onClick={close}
              className="flex-1 h-11 rounded-xl bg-[var(--nyven-cyan)] text-[#071018] text-sm font-semibold"
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
