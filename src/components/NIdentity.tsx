import { useMemo } from 'react'
import clsx from 'clsx'
import nWhite from '../assets/nyven-n-white.png'
import nIdentity from '../assets/nyven-n-identity.png'
import nThinking from '../assets/nyven-n-thinking.png'

/**
 * N visual states driven by real Core activity when possible.
 * Existing assets are reused; CSS/motion differentiates generating vs thinking.
 * Future: planning, searching, speaking, listening, etc.
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
      return 'white'
    case 'completed':
    case 'idle':
    case 'white':
    default:
      return 'white'
  }
}

export function NIdentity({
  state = 'white',
  size = 40,
  className,
  alt = 'NYVEN',
  animated = true,
}: NIdentityProps) {
  const asset = resolveAsset(state)
  const src = useMemo(() => {
    switch (asset) {
      case 'identity':
        return nIdentity
      case 'thinking':
        return nThinking
      default:
        return nWhite
    }
  }, [asset])

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
        'select-none object-contain',
        animated && state === 'thinking' && 'n-thinking-glow',
        animated && state === 'generating' && 'n-generating-glow',
        animated && (state === 'idle' || state === 'white') && 'n-idle-glow',
        state === 'identity' && 'drop-shadow-[0_0_16px_rgba(98,230,255,0.35)]',
        state === 'error' && 'opacity-70',
        state === 'completed' && 'opacity-95',
        isActive && animated && state !== 'thinking' && state !== 'generating' && 'n-thinking-glow',
        className
      )}
      draggable={false}
    />
  )
}
