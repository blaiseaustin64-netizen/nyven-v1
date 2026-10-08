/**
 * NYVEN Liquid Voice — signature canvas visualization.
 * Real energy from mic/TTS analysers when available; procedural idle/thinking otherwise.
 * States: idle | listening | thinking | speaking
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export type LiquidMode = 'idle' | 'listening' | 'thinking' | 'speaking'

type Props = {
  mode: LiquidMode
  /** 0–1 from analyser; ignored for pure procedural modes */
  energy?: number
  className?: string
  /** CSS pixel size (canvas is DPR-scaled) */
  size?: number
  /** Prefer reduced motion */
  reducedMotion?: boolean
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function LiquidVoice({
  mode,
  energy = 0,
  className,
  size = 220,
  reducedMotion = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  const energyRef = useRef(energy)
  const smoothE = useRef(0.06)
  const targetE = useRef(0.06)
  const phase = useRef(0)
  const reducedRef = useRef(reducedMotion)

  modeRef.current = mode
  energyRef.current = energy
  reducedRef.current = reducedMotion

  useEffect(() => {
    const mq =
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    const apply = () => {
      reducedRef.current = reducedMotion || !!mq?.matches
    }
    apply()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [reducedMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    let cssSize = size
    const resize = () => {
      cssSize = size
      canvas.width = Math.floor(cssSize * dpr)
      canvas.height = Math.floor(cssSize * dpr)
      canvas.style.width = `${cssSize}px`
      canvas.style.height = `${cssSize}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    let raf = 0
    let last = performance.now()

    const drawBlob = (
      cx: number,
      cy: number,
      baseR: number,
      layers: number,
      e: number,
      t: number,
      swirl: number
    ) => {
      for (let L = 0; L < layers; L++) {
        const depth = L / Math.max(1, layers - 1)
        const radius = baseR * (0.55 + depth * 0.5) * (0.92 + e * 0.28)
        const wobble = baseR * (0.03 + e * 0.14) * (1 - depth * 0.35)
        const steps = reducedRef.current ? 36 : 64
        ctx.beginPath()
        for (let i = 0; i <= steps; i++) {
          const ang = (i / steps) * Math.PI * 2
          const n1 = Math.sin(ang * 3 + t * (0.7 + L * 0.15) + swirl)
          const n2 = Math.sin(ang * 5 - t * 1.1 + L * 1.7 + swirl * 0.5)
          const n3 = Math.cos(ang * 2 + t * 0.4 + depth * 2)
          const deform = n1 * 0.55 + n2 * 0.3 + n3 * 0.2
          const r = radius + deform * wobble
          const x = cx + Math.cos(ang) * r
          const y = cy + Math.sin(ang) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()

        // Graphite → cyan/violet by depth & energy
        const alpha = 0.12 + (1 - depth) * 0.22 + e * 0.12
        if (L === layers - 1) {
          const g = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.15)
          g.addColorStop(0, `rgba(98, 230, 255, ${0.18 + e * 0.25})`)
          g.addColorStop(0.45, `rgba(139, 124, 255, ${0.1 + e * 0.12})`)
          g.addColorStop(1, `rgba(17, 23, 34, 0)`)
          ctx.fillStyle = g
        } else {
          ctx.fillStyle = `rgba(${28 + depth * 12}, ${34 + depth * 10}, ${48 + depth * 8}, ${alpha})`
        }
        ctx.fill()

        // Soft stroke on outer layer
        if (L === layers - 1) {
          ctx.strokeStyle = `rgba(98, 230, 255, ${0.15 + e * 0.35})`
          ctx.lineWidth = 1.25
          ctx.stroke()
        }
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      phase.current += dt

      const m = modeRef.current
      const raw = Math.max(0, Math.min(1, energyRef.current))
      if (m === 'idle') targetE.current = 0.05 + Math.sin(phase.current * 0.6) * 0.015
      else if (m === 'thinking') targetE.current = 0.14 + Math.sin(phase.current * 1.1) * 0.04
      else if (m === 'listening') targetE.current = 0.12 + raw * 0.55
      else targetE.current = 0.18 + raw * 0.7 // speaking

      const ease = reducedRef.current ? 0.2 : 0.1
      smoothE.current = lerp(smoothE.current, targetE.current, 1 - Math.pow(1 - ease, dt * 60))
      const e = smoothE.current
      const t = phase.current

      ctx.clearRect(0, 0, cssSize, cssSize)
      const cx = cssSize / 2
      const cy = cssSize / 2

      // Ambient glow disc
      const glow = ctx.createRadialGradient(cx, cy, cssSize * 0.05, cx, cy, cssSize * 0.48)
      glow.addColorStop(0, `rgba(28, 34, 48, ${0.85 + e * 0.1})`)
      glow.addColorStop(0.55, `rgba(12, 16, 24, 0.75)`)
      glow.addColorStop(1, 'rgba(7, 9, 13, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, cssSize * 0.48, 0, Math.PI * 2)
      ctx.fill()

      const swirl =
        m === 'thinking'
          ? t * 0.55
          : m === 'speaking'
            ? t * 0.9
            : m === 'listening'
              ? t * 0.35
              : t * 0.12

      const layers = reducedRef.current ? 3 : 5
      drawBlob(cx, cy, cssSize * 0.32, layers, e, t, swirl)

      // Inner core
      const coreR = cssSize * (0.06 + e * 0.05)
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2)
      core.addColorStop(0, `rgba(98, 230, 255, ${0.35 + e * 0.4})`)
      core.addColorStop(0.6, `rgba(139, 124, 255, ${0.12 + e * 0.15})`)
      core.addColorStop(1, 'rgba(7, 9, 13, 0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={clsx('block', className)}
      width={size}
      height={size}
      aria-hidden
    />
  )
}
