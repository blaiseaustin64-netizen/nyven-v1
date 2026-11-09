import type { CSSProperties } from 'react'
import wordmark from '../assets/nyven-wordmark.png'
import './WordmarkIntro.css'

/**
 * Animated NYVEN wordmark for the mobile sign in / sign out header.
 * Plays once when it mounts: blur-to-sharp reveal from left to right,
 * soft cyan/violet glow, then a light sweep every few seconds.
 * Respects prefers-reduced-motion.
 */
export function WordmarkIntro({ className }: { className?: string }) {
  const style = { ['--wmi-src' as string]: `url(${wordmark})` } as CSSProperties
  return (
    <div className={className ? `wmi ${className}` : 'wmi'} style={style}>
      <div className="wmi-glow" aria-hidden />
      <div className="wmi-stage">
        <img className="wmi-word" src={wordmark} alt="NYVEN" draggable={false} />
        <div className="wmi-shine" aria-hidden />
      </div>
    </div>
  )
}
