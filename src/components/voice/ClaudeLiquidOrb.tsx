/**
 * Claude liquid-wave orb — adapted from the supplied standalone HTML/Canvas source.
 * Preserves: 5-layer waves, crest glow, outer ring, state sim, color mix.
 * Props drive operational state + voice palette (calm gradient only).
 */
import { useEffect, useRef } from 'react'
import type { OrbRgb } from '../../lib/voice/catalog'

export type ClaudeOrbState = 'calm' | 'think' | 'speak' | 'listen'

export type ClaudeOrbProps = {
  state?: ClaudeOrbState
  /** Voice identity palette — replaces calm/think a,b from original */
  paletteA?: OrbRgb
  paletteB?: OrbRgb
  /** CSS pixel size (canvas is DPR-scaled) */
  size?: number
  className?: string
  'aria-label'?: string
}

/** Original Claude operational speak/listen colours (unchanged) */
const SPEAK_A: OrbRgb = [0, 217, 230]
const SPEAK_B: OrbRgb = [217, 38, 255]
const LISTEN_A: OrbRgb = [255, 51, 102]
const LISTEN_B: OrbRgb = [255, 179, 13]
const DEFAULT_A: OrbRgb = [20, 89, 255]
const DEFAULT_B: OrbRgb = [179, 31, 242]

export function ClaudeLiquidOrb({
  state = 'calm',
  paletteA = DEFAULT_A,
  paletteB = DEFAULT_B,
  size: sizeProp,
  className,
  'aria-label': ariaLabel = 'Animated wave orb',
}: ClaudeOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const paletteRef = useRef({ a: paletteA, b: paletteB })
  const rafRef = useRef(0)
  const curRef = useRef(0.03)
  const kickRef = useRef(0)
  const caRef = useRef<OrbRgb>([...paletteA] as OrbRgb)
  const cbRef = useRef<OrbRgb>([...paletteB] as OrbRgb)

  stateRef.current = state
  paletteRef.current = { a: paletteA, b: paletteB }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return

    const reduce =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches

    const computeSize = () => {
      if (sizeProp && sizeProp > 0) return Math.round(sizeProp)
      return Math.round(Math.min(220, window.innerWidth * 0.55, 240))
    }

    let SIZE = computeSize()
    const d = Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2)

    const resize = () => {
      SIZE = computeSize()
      canvas.width = canvas.height = SIZE * d
      canvas.style.width = SIZE + 'px'
      canvas.style.height = SIZE + 'px'
    }
    resize()

    const mix = (a: number[], b: number[], t: number) =>
      a.map((v, i) => v + (b[i] - v) * t)
    const rgb = (a: number[], al = 1) =>
      'rgba(' + a.map(Math.round).join(',') + ',' + al + ')'
    const wv = (x: number, t: number, s: number) =>
      Math.sin(x * s + t * 1.1) * 0.5 +
      Math.sin(x * 1.7 * s - t * 0.8 + 1.7) * 0.3 +
      Math.sin(x * 2.9 * s + t * 1.5 + 4) * 0.2
    const sim = (t: number) => {
      const s = Math.max(0, Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1)) * 0.8
      const k = 0.5 + 0.5 * Math.sin(t * 0.9)
      return Math.min(1, s * k + 0.12 * Math.sin(t * 13) * k)
    }

    const targetColors = (st: ClaudeOrbState): { a: OrbRgb; b: OrbRgb } => {
      const { a, b } = paletteRef.current
      if (st === 'speak') return { a: SPEAK_A, b: SPEAK_B }
      if (st === 'listen') return { a: LISTEN_A, b: LISTEN_B }
      // calm + think share voice palette (original Claude behavior for calm/think)
      return { a, b }
    }

    const draw = (now: number) => {
      const w = canvas.width
      const h = canvas.height
      const t = (now / 1000) * (reduce ? 0.3 : 1)
      const st = stateRef.current
      const p = targetColors(st)

      const level =
        st === 'speak'
          ? 0.2 + 0.8 * sim(t)
          : st === 'listen'
            ? 0.15 + 0.6 * sim(t + 3)
            : st === 'think'
              ? 0.4
              : 0.08

      curRef.current += (level - curRef.current) * 0.06
      kickRef.current += ((st === 'calm' ? 0 : 1) - kickRef.current) * 0.04
      const cur = curRef.current
      const kick = kickRef.current
      const ca = caRef.current
      const cb = cbRef.current
      for (let i = 0; i < 3; i++) {
        ca[i] += (p.a[i] - ca[i]) * 0.05
        cb[i] += (p.b[i] - cb[i]) * 0.05
      }
      const mid = mix(ca, cb, 0.5)

      g.clearRect(0, 0, w, h)
      g.save()
      g.beginPath()
      g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2)
      g.clip()

      const bg = g.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#0b0e1b')
      bg.addColorStop(1, '#12172c')
      g.fillStyle = bg
      g.fillRect(0, 0, w, h)

      for (let i = 0; i < 5; i++) {
        const fi = i
        const amp = (0.02 + 0.17 * cur) * (1 - fi * 0.12)
        const spd = t * (0.7 + 0.25 * kick + fi * 0.1) + fi * 1.9
        const base = h * (0.5 + (fi - 2) * 0.032) - cur * h * 0.03
        const yAt = (x: number) => {
          const u = x / w
          return (
            base +
            wv((u - 0.5) * 3.2, spd, 1.6 + fi * 0.22) *
              amp *
              h *
              (0.55 + 0.45 * Math.cos((u - 0.5) * Math.PI))
          )
        }
        const t0 = Math.max(0, Math.min(1, fi / 4 - 0.288 + 0.1))
        const t1 = Math.max(0, Math.min(1, fi / 4 + 0.288 + 0.1))
        const col0 = mix(ca, cb, t0)
        const col1 = mix(ca, cb, t1)

        g.beginPath()
        g.moveTo(0, h)
        for (let x = 0; x <= w; x += 2) g.lineTo(x, yAt(x))
        g.lineTo(w, h)
        g.closePath()
        const hg = g.createLinearGradient(0, 0, w, 0)
        hg.addColorStop(0, rgb(col0))
        hg.addColorStop(1, rgb(col1))
        g.globalAlpha = 0.8
        g.fillStyle = hg
        g.fill()

        const vg = g.createLinearGradient(0, base - h * 0.05, 0, base + h * 0.5)
        vg.addColorStop(0, 'rgba(4,6,16,0)')
        vg.addColorStop(1, 'rgba(4,6,16,.62)')
        g.globalAlpha = 1
        g.fillStyle = vg
        g.fill()

        g.beginPath()
        for (let x = 0; x <= w; x += 2)
          x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x))
        const cg = g.createLinearGradient(0, 0, w, 0)
        cg.addColorStop(
          0,
          rgb(col0.map((v) => Math.min(255, v * 1.4)))
        )
        cg.addColorStop(
          1,
          rgb(col1.map((v) => Math.min(255, v * 1.4)))
        )
        g.shadowColor = rgb(mid)
        g.shadowBlur = d * 7
        g.globalAlpha = 0.85
        g.lineWidth = d * 1.4
        g.strokeStyle = cg
        g.stroke()
        g.shadowBlur = 0
      }

      g.restore()
      g.globalAlpha = 1

      const rg = g.createLinearGradient(0, 0, w, 0)
      rg.addColorStop(0, rgb(ca))
      rg.addColorStop(1, rgb(cb))
      g.beginPath()
      g.arc(w / 2, h / 2, w / 2 - d * 1.2, 0, Math.PI * 2)
      g.shadowColor = rgb(mid)
      g.shadowBlur = d * 8
      g.strokeStyle = rg
      g.lineWidth = d * 2.4
      g.stroke()
      g.shadowBlur = 0

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [sizeProp])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={ariaLabel}
      style={{ display: 'block', borderRadius: '50%' }}
    />
  )
}
