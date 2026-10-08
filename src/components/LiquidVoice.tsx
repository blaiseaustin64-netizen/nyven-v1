/**
 * NYVEN Liquid Voice — canvas fluid field driven by real audio energy.
 * Palette: graphite, silver, electric cyan, restrained violet.
 * No rainbow / equalizer bars / fake random pulse.
 */

import { useEffect, useRef } from 'react'
import clsx from 'clsx'

type Mode = 'idle' | 'listening' | 'speaking'

type Props = {
  mode: Mode
  /** 0–1 from mic analyser or playback analyser */
  energy: number
  className?: string
  size?: number
}

export function LiquidVoice({ mode, energy, className, size = 56 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const energyRef = useRef(energy)
  const modeRef = useRef(mode)
  const smoothRef = useRef(0)
  const phaseRef = useRef(0)

  energyRef.current = energy
  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    const draw = () => {
      const t = performance.now() / 1000
      phaseRef.current = t
      const target =
        modeRef.current === 'idle'
          ? 0.08
          : modeRef.current === 'listening'
            ? 0.15 + energyRef.current * 0.45
            : 0.22 + energyRef.current * 0.75
      smoothRef.current += (target - smoothRef.current) * 0.12
      const e = smoothRef.current

      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2

      // Soft graphite base disc
      const base = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.48)
      base.addColorStop(0, 'rgba(28, 34, 48, 0.95)')
      base.addColorStop(0.7, 'rgba(17, 23, 34, 0.9)')
      base.addColorStop(1, 'rgba(7, 9, 13, 0.2)')
      ctx.fillStyle = base
      ctx.beginPath()
      ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2)
      ctx.fill()

      // Liquid rings — cyan + restrained violet driven by energy
      const rings = 3
      for (let r = 0; r < rings; r++) {
        const radius = size * (0.18 + r * 0.09) * (0.85 + e * 0.35)
        const wobble = (0.04 + e * 0.12) * size
        ctx.beginPath()
        const steps = 48
        for (let i = 0; i <= steps; i++) {
          const ang = (i / steps) * Math.PI * 2
          const n =
            Math.sin(ang * 3 + t * (1.2 + r * 0.3) + r) * wobble * 0.55 +
            Math.sin(ang * 5 - t * 1.6 + r * 2) * wobble * 0.35
          const x = cx + Math.cos(ang) * (radius + n)
          const y = cy + Math.sin(ang) * (radius + n * 0.9)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        const alpha = 0.15 + e * 0.45 - r * 0.04
        if (r % 2 === 0) {
          ctx.strokeStyle = `rgba(98, 230, 255, ${Math.max(0.08, alpha)})`
        } else {
          ctx.strokeStyle = `rgba(139, 124, 255, ${Math.max(0.06, alpha * 0.85)})`
        }
        ctx.lineWidth = 1.2 + e * 1.5
        ctx.stroke()
      }

      // Silver core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * (0.12 + e * 0.08))
      core.addColorStop(0, `rgba(220, 228, 240, ${0.35 + e * 0.4})`)
      core.addColorStop(0.5, `rgba(98, 230, 255, ${0.2 + e * 0.25})`)
      core.addColorStop(1, 'rgba(98, 230, 255, 0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, size * (0.14 + e * 0.1), 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={clsx('block', className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
