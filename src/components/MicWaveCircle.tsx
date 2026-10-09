/**
 * Compact circular mic/dictation wave (composer only).
 * Claude circular canvas concept — NOT the full Liquid Voice WebGL experience.
 * Driven by real mic energy when available.
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

type Props = {
  active: boolean
  /** 0–1 from MicRecorder analyser */
  energy?: number
  size?: number
  className?: string
  onClick?: () => void
  label?: string
}

export function MicWaveCircle({
  active,
  energy = 0,
  size = 44,
  className,
  onClick,
  label = 'Stop listening',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const energyRef = useRef(energy)
  energyRef.current = energy

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let level = 0
    const t0 = performance.now()
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      const target = Math.max(0.08, Math.min(1, energyRef.current * 1.4 + 0.06))
      level += (target - level) * (target > level ? 0.28 : 0.1)
      if (reduce) level = Math.min(level, 0.2)

      // Dark radial background (Claude-style circle interior)
      ctx.clearRect(0, 0, size, size)
      const g = ctx.createRadialGradient(
        size / 2,
        size / 2,
        2,
        size / 2,
        size / 2,
        size / 2
      )
      g.addColorStop(0, '#12162a')
      g.addColorStop(0.65, '#0a0c16')
      g.addColorStop(1, '#07080d')
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()

      // Clip to circle for waves
      ctx.save()
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
      ctx.clip()

      const cx = size / 2
      const midY = size / 2
      const amp = (2.5 + level * 10) * (reduce ? 0.4 : 1)
      const layers = [
        { color: 'rgba(79, 140, 255, 0.85)', phase: 0, freq: 2.2, w: 1.5 },
        { color: 'rgba(139, 100, 255, 0.55)', phase: 1.2, freq: 2.8, w: 1.2 },
        { color: 'rgba(47, 107, 255, 0.35)', phase: 2.4, freq: 1.7, w: 1 },
      ]

      for (const layer of layers) {
        ctx.beginPath()
        const steps = 48
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * size
          const nx = (i / steps - 0.5) * Math.PI * 2
          const y =
            midY +
            Math.sin(nx * layer.freq + t * 3.2 + layer.phase) * amp +
            Math.sin(nx * 1.4 - t * 2.1 + layer.phase) * amp * 0.35
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = layer.color
        ctx.lineWidth = layer.w
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      ctx.restore()

      // Subtle ring
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.stroke()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active, size])

  if (!active) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative shrink-0 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50',
        className
      )}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="block rounded-full"
        style={{ width: size, height: size, borderRadius: '50%' }}
        aria-hidden
      />
    </button>
  )
}
