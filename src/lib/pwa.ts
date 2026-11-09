export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
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

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
