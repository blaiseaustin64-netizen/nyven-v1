export type ThemeChoice = 'default' | 'system' | 'dark' | 'light'

export type AppearancePrefs = {
  theme: ThemeChoice
  textScale: number // 0.9 – 1.25
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

export function resolveTheme(choice: ThemeChoice): 'dark' | 'light' {
  if (choice === 'light') return 'light'
  if (choice === 'dark' || choice === 'default') return 'dark'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

export function applyAppearance(p: AppearancePrefs) {
  const resolved = resolveTheme(p.theme)
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark')
  document.documentElement.style.setProperty('--nyven-font-scale', `${(p.textScale || 1) * 16}px`)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F6F4EF' : '#07090D')
}
