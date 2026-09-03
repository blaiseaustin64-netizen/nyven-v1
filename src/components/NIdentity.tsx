import { useMemo } from 'react'
import clsx from 'clsx'
import nWhite from '../assets/nyven-n-white.png'
import nIdentity from '../assets/nyven-n-identity.png'
import nThinking from '../assets/nyven-n-thinking.png'

export type NState = 'white' | 'identity' | 'thinking'

interface NIdentityProps {
  state?: NState
  size?: number | string
  className?: string
  alt?: string
  animated?: boolean
}

export function NIdentity({
  state = 'white',
  size = 40,
  className,
  alt = 'NYVEN',
  animated = true,
}: NIdentityProps) {
  const src = useMemo(() => {
    switch (state) {
      case 'identity':
        return nIdentity
      case 'thinking':
        return nThinking
      default:
        return nWhite
    }
  }, [state])

  const sizeStyle =
    typeof size === 'number'
      ? { width: size, height: 'auto' }
      : { width: size, height: 'auto' }

  return (
    <img
      src={src}
      alt={alt}
      style={sizeStyle}
      className={clsx(
        'select-none object-contain',
        state === 'thinking' && animated && 'n-thinking-glow',
        state === 'white' && animated && 'n-idle-glow',
        state === 'identity' && 'drop-shadow-[0_0_16px_rgba(98,230,255,0.35)]',
        className
      )}
      draggable={false}
    />
  )
}
