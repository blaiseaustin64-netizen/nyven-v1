
export type ThemeChoice = 'default' | 'system' | 'dark' | 'light'

export type AppearancePrefs = {
  theme: ThemeChoice
  textScale: number
}

const KEY = 'nyven_appearance_v1'

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'default',
  textScale: 1,
}

export function loadAppearance(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(p: AppearancePrefs) {
  localStorage.setItem(KEY, JSON.stringify(p))
  applyAppearance(p)
}

export function resolveThemeAttr(choice: ThemeChoice): 'default' | 'dark' | 'light' {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  if (choice === 'default') return 'default'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'default'
}

function applyThemeAttrs(p: AppearancePrefs) {
  const attr = resolveThemeAttr(p.theme)
  document.documentElement.setAttribute('data-theme', attr)
  document.documentElement.style.setProperty('--nyven-font-scale', `${(p.textScale || 1) * 16}px`)
  const meta = document.querySelector('meta[name="theme-color"]')
  const colors: Record<string, string> = {
    default: '#07090D',
    dark: '#000000',
    light: '#F6F4EF',
  }
  if (meta) meta.setAttribute('content', colors[attr] || colors.default)
  document.documentElement.style.colorScheme = attr === 'light' ? 'light' : 'dark'
}

export function applyAppearance(p: AppearancePrefs) {
  const run = () => applyThemeAttrs(p)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduced) {
    run()
    return
  }

  // View Transitions API when available
  // @ts-expect-error startViewTransition
  if (typeof document !== 'undefined' && document.startViewTransition) {
    try {
      // @ts-expect-error startViewTransition
      document.startViewTransition(() => {
        run()
      })
      return
    } catch {
      /* fall through */
    }
  }

  // Temporary transition class (~300ms)
  const html = document.documentElement
  html.classList.add('nyven-theme-animating')
  run()
  window.setTimeout(() => {
    html.classList.remove('nyven-theme-animating')
  }, 320)
}

export function subscribeSystemTheme(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const fn = () => onChange()
  mq.addEventListener?.('change', fn)
  return () => mq.removeEventListener?.('change', fn)
}
