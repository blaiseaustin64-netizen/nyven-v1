export type ThemeChoice = 'nyven' | 'system' | 'dark' | 'light'
export type ResolvedTheme = 'nyven' | 'dark' | 'light'

export type AppearancePrefs = {
  theme: ThemeChoice
}

const KEY = 'nyven_appearance_v1'

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'nyven',
}

/** Browser chrome color (<meta name="theme-color">) per resolved theme. Matches --nyven-bg. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  nyven: '#07090D',
  dark: '#000000',
  light: '#F6F4EF',
}

function migrateTheme(raw: string | undefined): ThemeChoice {
  if (raw === 'default') return 'nyven'
  if (raw === 'nyven' || raw === 'system' || raw === 'dark' || raw === 'light') return raw
  return 'nyven'
}

export function loadAppearance(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const parsed = JSON.parse(raw) as { theme?: string }
    // Old saved values may still contain textScale; it is simply ignored.
    return { theme: migrateTheme(parsed.theme) }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(p: AppearancePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: p.theme }))
  } catch {
    /* storage unavailable: still apply for this session */
  }
  applyAppearance(p)
}

/** Resolved theme attribute on <html data-theme="...">. "system" follows the phone live. */
export function resolveThemeAttr(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  if (choice === 'nyven') return 'nyven'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'nyven'
}

function setMeta(name: string, content: string) {
  const meta = document.querySelector(`meta[name="${name}"]`)
  if (meta) meta.setAttribute('content', content)
}

function applyThemeAttrs(p: AppearancePrefs) {
  const attr = resolveThemeAttr(p.theme)
  const root = document.documentElement
  root.setAttribute('data-theme', attr)
  const scheme = attr === 'light' ? 'light' : 'dark'
  root.style.colorScheme = scheme
  setMeta('theme-color', THEME_COLOR[attr])
  setMeta('color-scheme', scheme)
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => unknown
}

const SWITCH_CLASS = 'nyven-theme-animating'
let switchTimer: number | undefined

/**
 * Apply a theme with a crossfade of the whole UI at once.
 * 1) document.startViewTransition (about 250ms, see ::view-transition rules in index.css)
 * 2) fallback: a temporary class on <html> for 300ms, then removed
 * Reduced motion: switch instantly.
 */
export function applyAppearance(p: AppearancePrefs) {
  const run = () => applyThemeAttrs(p)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (typeof document === 'undefined' || reduced) {
    run()
    return
  }

  const doc = document as ViewTransitionDoc
  if (typeof doc.startViewTransition === 'function') {
    try {
      doc.startViewTransition(run)
      return
    } catch {
      /* fall through to the class based crossfade */
    }
  }

  const html = document.documentElement
  html.classList.add(SWITCH_CLASS)
  run()
  if (switchTimer) window.clearTimeout(switchTimer)
  switchTimer = window.setTimeout(() => {
    html.classList.remove(SWITCH_CLASS)
    switchTimer = undefined
  }, 300)
}

export function subscribeSystemTheme(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const fn = () => onChange()
  mq.addEventListener?.('change', fn)
  return () => mq.removeEventListener?.('change', fn)
}
