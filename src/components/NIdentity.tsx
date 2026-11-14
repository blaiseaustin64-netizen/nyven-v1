import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import nWhite from '../assets/nyven-n-white.png'
import nIdentity from '../assets/nyven-n-identity.png'
import nThinking from '../assets/nyven-n-thinking.png'
import nLight from '../assets/nyven-n-light.png'

/**
 * N visual states driven by real Core activity when possible.
 * Light theme uses the dedicated black N mark; dark/nyven keep existing assets.
 */
export type NState =
  | 'white'
  | 'identity'
  | 'idle'
  | 'thinking'
  | 'generating'
  | 'completed'
  | 'error'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'analyzing'
  | 'executing'
  | 'speaking'
  | 'listening'
  | 'waiting_for_approval'

interface NIdentityProps {
  state?: NState
  size?: number | string
  className?: string
  alt?: string
  animated?: boolean
  /** Force dark-theme assets (startup intro, auth). Ignores active app theme. */
  forceDarkAssets?: boolean
}

function resolveAsset(state: NState): 'white' | 'identity' | 'thinking' {
  switch (state) {
    case 'identity':
      return 'identity'
    case 'thinking':
    case 'planning':
    case 'searching':
    case 'reading':
    case 'analyzing':
    case 'executing':
    case 'generating':
    case 'waiting_for_approval':
    case 'speaking':
    case 'listening':
      return 'thinking'
    case 'error':
    case 'completed':
    case 'idle':
    case 'white':
    default:
      return 'white'
  }
}

function readIsLightTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.getAttribute('data-theme') === 'light'
}

export function NIdentity({
  state = 'white',
  size = 40,
  className,
  alt = 'NYVEN',
  animated = true,
  forceDarkAssets = false,
}: NIdentityProps) {
  const [isLight, setIsLight] = useState(readIsLightTheme)

  useEffect(() => {
    if (forceDarkAssets) {
      setIsLight(false)
      return
    }
    const sync = () => setIsLight(readIsLightTheme())
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => obs.disconnect()
  }, [forceDarkAssets])

  const asset = resolveAsset(state)
  const src = useMemo(() => {
    // Light theme: dedicated black N for all states (provided asset)
    if (isLight && !forceDarkAssets) {
      return nLight
    }
    switch (asset) {
      case 'identity':
        return nIdentity
      case 'thinking':
        return nThinking
      default:
        return nWhite
    }
  }, [asset, isLight, forceDarkAssets])

  const sizeStyle =
    typeof size === 'number'
      ? { width: size, height: 'auto' as const }
      : { width: size, height: 'auto' as const }

  const isActive =
    state === 'thinking' ||
    state === 'generating' ||
    state === 'planning' ||
    state === 'searching' ||
    state === 'analyzing' ||
    state === 'executing' ||
    state === 'speaking' ||
    state === 'listening'

  return (
    <img
      src={src}
      alt={alt}
      style={sizeStyle}
      className={clsx(
        // Do not use invert filter — assets are theme-correct
        'select-none object-contain',
        animated && state === 'thinking' && !isLight && 'n-thinking-glow',
        animated && state === 'generating' && !isLight && 'n-generating-glow',
        animated && (state === 'idle' || state === 'white') && !isLight && 'n-idle-glow',
        state === 'identity' && !isLight && 'drop-shadow-[0_0_16px_var(--nyven-glow-strong)]',
        state === 'error' && 'opacity-70',
        state === 'completed' && 'opacity-95',
        isActive && animated && state !== 'thinking' && state !== 'generating' && !isLight && 'n-thinking-glow',
        className
      )}
      draggable={false}
    />
  )
}
