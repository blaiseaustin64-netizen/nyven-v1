export type ThemeChoice = 'nyven' | 'system' | 'dark' | 'light'

export type AppearancePrefs = {
  theme: ThemeChoice
  textScale: number
}

const KEY = 'nyven_appearance_v1'

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'nyven',
  textScale: 1,
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
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>
    return {
      theme: migrateTheme(parsed.theme as string | undefined),
      textScale: typeof parsed.textScale === 'number' ? parsed.textScale : 1,
    }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(p: AppearancePrefs) {
  localStorage.setItem(KEY, JSON.stringify(p))
  applyAppearance(p)
}

/** Resolved theme attribute on <html data-theme="..."> */
export function resolveThemeAttr(choice: ThemeChoice): 'nyven' | 'dark' | 'light' {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  if (choice === 'nyven') return 'nyven'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'nyven'
}

function applyThemeAttrs(p: AppearancePrefs) {
  const attr = resolveThemeAttr(p.theme)
  document.documentElement.setAttribute('data-theme', attr)
  document.documentElement.style.setProperty('--nyven-font-scale', `${(p.textScale || 1) * 16}px`)
  const meta = document.querySelector('meta[name="theme-color"]')
  const colors: Record<string, string> = {
    nyven: '#07090D',
    dark: '#000000',
    light: '#F6F4EF',
  }
  if (meta) meta.setAttribute('content', colors[attr] || colors.nyven)
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
