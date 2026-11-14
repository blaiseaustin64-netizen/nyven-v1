export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __nyvenDeferredInstall?: BeforeInstallPromptEvent | null
    __nyvenInstallListeners?: Array<(e: BeforeInstallPromptEvent | null) => void>
  }
}

/** Call as early as possible (main.tsx) so the event is not missed. */
export function captureInstallPromptEarly() {
  if (typeof window === 'undefined') return
  window.__nyvenInstallListeners = window.__nyvenInstallListeners || []
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    const ev = e as BeforeInstallPromptEvent
    window.__nyvenDeferredInstall = ev
    window.__nyvenInstallListeners?.forEach((fn) => fn(ev))
  })
}

export function getDeferredInstall(): BeforeInstallPromptEvent | null {
  return (typeof window !== 'undefined' && window.__nyvenDeferredInstall) || null
}

export function onDeferredInstall(fn: (e: BeforeInstallPromptEvent | null) => void) {
  if (typeof window === 'undefined') return () => {}
  window.__nyvenInstallListeners = window.__nyvenInstallListeners || []
  window.__nyvenInstallListeners.push(fn)
  if (window.__nyvenDeferredInstall) fn(window.__nyvenDeferredInstall)
  return () => {
    window.__nyvenInstallListeners = (window.__nyvenInstallListeners || []).filter((f) => f !== fn)
  }
}

const UPDATE_CHECK_MIN_GAP_MS = 15_000

/** Ask the browser to look for a new sw.js: once on app open, and whenever the app comes back to the foreground. */
function startUpdateChecks(reg: ServiceWorkerRegistration) {
  let last = 0
  const check = () => {
    const now = Date.now()
    if (now - last < UPDATE_CHECK_MIN_GAP_MS) return
    last = now
    reg.update().catch(() => {})
  }
  check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) check()
  })
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // updateViaCache: 'none' → sw.js itself is never served from the HTTP cache
      .register('/sw.js', { updateViaCache: 'none' })
      .then(startUpdateChecks)
      .catch(() => {})
  })
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error iOS
    window.navigator.standalone === true
  )
}

const DISMISS_KEY = 'nyven_install_dismissed_until'
const CHAT_COUNT_KEY = 'nyven_chat_turns_for_install'

export function recordChatTurnForInstall() {
  try {
    const n = Number(localStorage.getItem(CHAT_COUNT_KEY) || '0') + 1
    localStorage.setItem(CHAT_COUNT_KEY, String(n))
    window.dispatchEvent(new CustomEvent('nyven-install-check', { detail: { turns: n } }))
    return n
  } catch {
    return 0
  }
}

export function shouldOfferInstall(): boolean {
  if (isStandalone()) return false
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || '0')
    if (Date.now() < until) return false
    const turns = Number(localStorage.getItem(CHAT_COUNT_KEY) || '0')
    return turns >= 3
  } catch {
    return false
  }
}

export function dismissInstall(days = 7) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 864e5))
  } catch {
    /* */
  }
}
