/**
 * NYVEN Liquid Voice — WebGL fragment-shader waves.
 * Visual source of truth: the confirmed working prototype (palette + math preserved).
 * React lifecycle: resize, rAF, mic analyser optional (external energy), full cleanup.
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export type LiquidMode = 'idle' | 'listening' | 'thinking' | 'speaking'

type Props = {
  mode: LiquidMode
  /** 0–1 from mic/TTS analyser when available */
  energy?: number
  className?: string
  /** When true, canvas fills parent (Voice Chat). When false, uses size. */
  fill?: boolean
  size?: number
  reducedMotion?: boolean
}

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'

const FS = `precision highp float;
uniform vec2 R;uniform float T,L,K;uniform vec3 A,B;
float wv(float x,float t,float s){
 return sin(x*s+t*1.1)*.5+sin(x*1.7*s-t*.8+1.7)*.3+sin(x*2.9*s+t*1.5+4.)*.2;
}
void main(){
 vec2 uv=gl_FragCoord.xy/R;
 float x=(uv.x-.5)*3.2;
 vec3 col=mix(vec3(.015,.02,.04),vec3(.045,.05,.1),uv.y);
 float e=1.5/R.y;
 float env=.55+.45*cos((uv.x-.5)*3.1416);
 for(int i=0;i<5;i++){
  float fi=float(i);
  float amp=(.018+.15*L)*(1.-fi*.12)*env;
  float spd=T*(.7+.25*K+fi*.1)+fi*1.9;
  float y=.5+L*.06-fi*.012+wv(x,spd,1.6+fi*.22)*amp;
  float m=smoothstep(y+e,y-e,uv.y);
  vec3 c=mix(A,B,clamp(fi/4.+x*.18+.1,0.,1.));
  c*=mix(1.,.35,clamp((y-uv.y)*1.7,0.,1.));
  float crest=exp(-abs(uv.y-y)*70.);
  col=mix(col,c,m*.78);
  col+=min(c*1.4,1.)*crest*.35;
 }
 gl_FragColor=vec4(col,1.);
}`

/** Prototype palettes — do not remap to UI cyan for consistency */
const PALETTES: Record<'idle' | 'speak' | 'listen', [[number, number, number], [number, number, number]]> = {
  idle: [
    [0.08, 0.35, 1.0],
    [0.7, 0.12, 0.95],
  ],
  speak: [
    [0.0, 0.85, 0.9],
    [0.85, 0.15, 1.0],
  ],
  listen: [
    [1.0, 0.2, 0.4],
    [1.0, 0.7, 0.05],
  ],
}

function modeKey(mode: LiquidMode): 'idle' | 'speak' | 'listen' {
  if (mode === 'listening') return 'listen'
  if (mode === 'speaking') return 'speak'
  // thinking uses speak palette with lower energy (handled in loop)
  if (mode === 'thinking') return 'speak'
  return 'idle'
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('LiquidVoice shader', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

export function LiquidVoice({
  mode,
  energy = 0,
  className,
  fill = false,
  size = 220,
  reducedMotion = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  const energyRef = useRef(energy)
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
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    })
    if (!gl) {
      console.warn('LiquidVoice: WebGL unavailable')
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VS)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('LiquidVoice link', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const U = (n: string) => gl.getUniformLocation(prog, n)
    const uR = U('R')
    const uT = U('T')
    const uL = U('L')
    const uK = U('K')
    const uA = U('A')
    const uB = U('B')

    let level = 0
    let target = 0
    let kick = 0
    const cA = [...PALETTES.idle[0]]
    const cB = [...PALETTES.idle[1]]
    const t0 = performance.now()
    let raf = 0
    let alive = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      let w: number
      let h: number
      if (fill) {
        const parent = canvas.parentElement
        w = parent?.clientWidth || window.innerWidth
        h = parent?.clientHeight || window.innerHeight
      } else {
        w = size
        h = size
      }
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    /** Procedural speaking envelope when no analyser energy */
    const simVoice = (t: number) => {
      const syl = Math.max(0, Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1)) * 0.8
      const word = 0.5 + 0.5 * Math.sin(t * 0.9)
      return Math.min(1, syl * word + 0.12 * Math.sin(t * 13) * word)
    }

    const frame = (now: number) => {
      if (!alive) return
      const t = (now - t0) / 1000
      const m = modeRef.current
      const raw = Math.max(0, Math.min(1, energyRef.current))
      const reduce = reducedRef.current

      if (m === 'idle') target = 0.06 + 0.04 * Math.sin(t * 1.1)
      else if (m === 'thinking') target = 0.1 + 0.05 * Math.sin(t * 0.9)
      else if (m === 'speaking') target = raw > 0.02 ? raw : simVoice(t)
      else target = raw > 0.02 ? raw : simVoice(t) * 0.8 // listening fallback

      if (reduce) target *= 0.4

      const rate = target > level ? 0.22 : 0.07
      level += (target - level) * rate
      kick += ((m === 'idle' ? 0 : 1) - kick) * 0.04

      const p = PALETTES[modeKey(m)]
      for (let i = 0; i < 3; i++) {
        cA[i] += (p[0][i] - cA[i]) * 0.05
        cB[i] += (p[1][i] - cB[i]) * 0.05
      }

      gl.uniform2f(uR, canvas.width, canvas.height)
      gl.uniform1f(uT, t * (reduce ? 0.3 : 1))
      gl.uniform1f(uL, level)
      gl.uniform1f(uK, kick)
      gl.uniform3f(uA, cA[0], cA[1], cA[2])
      gl.uniform3f(uB, cB[0], cB[1], cB[2])
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      gl.deleteBuffer(buf)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteProgram(prog)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  }, [fill, size])

  return (
    <canvas
      ref={canvasRef}
      className={clsx(fill ? 'absolute inset-0 w-full h-full' : 'block', className)}
      aria-hidden
    />
  )
}
