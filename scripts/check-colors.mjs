#!/usr/bin/env node
/**
 * check-colors: fails when UI code hard-codes colors instead of using the theme.
 *
 * Flags, in src/**\/*.tsx:
 *   - hex colors            (#fff, #07090D, #rrggbbaa)
 *   - rgb()/rgba()/hsl()/hsla() with literal numbers (rgb(var(--x)) is fine)
 *   - Tailwind classes text-white / bg-white / bg-black / text-black (+ border/ring/from/via/to/fill/stroke, with optional /opacity)
 *
 * Use theme colors instead: bg-nyven-bg, text-nyven-text, border-nyven-border,
 * var(--nyven-*) or rgb(var(--nyven-*-rgb) / 0.5). See src/index.css.
 *
 * Run: npm run check:colors
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/**
 * Short allowlist. `pattern` (optional) limits the exemption to matching text.
 * Anything not listed here must use the theme.
 */
const ALLOW = [
  { file: 'src/components/IntroSequence.tsx', reason: 'Intro stays dark in every theme (.nyven-intro-bg)' },
  { file: 'src/components/voice/ClaudeLiquidOrb.tsx', reason: 'Voice orb canvas art' },
  { file: 'src/components/MicWaveCircle.tsx', reason: 'Voice orb canvas art' },
  { file: 'src/components/attachments/AttachmentViewer.tsx', reason: 'Media viewer overlay must be dark' },
  { file: 'src/components/markdown/MessageContent.tsx', pattern: /bg-black|#e8eaed/, reason: 'Code box stays black in every theme' },
  { file: 'src/pages/Preview.tsx', pattern: /bg-white/, reason: 'Iframe canvas for previewed HTML (pages assume white)' },
  { file: 'src/pages/Builder.tsx', pattern: /bg-white/, reason: 'Iframe canvas for previewed HTML (pages assume white)' },
]

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g
const FUNC = /\b(?:rgba?|hsla?)\(\s*\d/g
const CLASS = /(?<![\w-])(?:text|bg|border|ring|from|via|to|fill|stroke|divide|outline|shadow)-(?:white|black)(?:\/\d+)?(?![\w-])/g

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const violations = []
const allowed = new Map() // file -> { reason, count }

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  const rules = ALLOW.filter((a) => a.file === rel)
  const lines = readFileSync(file, 'utf8').split('\n')
  let inBlockComment = false

  lines.forEach((raw, i) => {
    let line = raw
    // skip comments
    if (inBlockComment) {
      if (line.includes('*/')) { line = line.slice(line.indexOf('*/') + 2); inBlockComment = false } else return
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('{/*') && trimmed.endsWith('*/}')) return
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) { inBlockComment = true; return }
    line = line.replace(/\/\*.*?\*\//g, '').replace(/\s\/\/\s.*$/, '')

    const hits = [
      ...(line.match(HEX) || []),
      ...(line.match(FUNC) || []),
      ...(line.match(CLASS) || []),
    ]
    if (!hits.length) return

    const rule = rules.find((r) => !r.pattern || r.pattern.test(line))
    if (rule) {
      const cur = allowed.get(rel) || { reason: rule.reason, count: 0 }
      cur.count += hits.length
      allowed.set(rel, cur)
      return
    }
    violations.push({ rel, line: i + 1, hits, text: trimmed.slice(0, 140) })
  })
}

console.log('check:colors  (src/**/*.tsx)\n')
if (allowed.size) {
  console.log('Allowlisted (intentional):')
  for (const [f, v] of allowed) console.log(`  ${f}  ×${v.count}  — ${v.reason}`)
  console.log('')
}
if (violations.length) {
  console.error(`FAIL: ${violations.length} hard-coded color line(s) outside the allowlist:\n`)
  for (const v of violations) console.error(`  ${v.rel}:${v.line}  [${v.hits.join(', ')}]\n    ${v.text}`)
  console.error('\nUse theme colors (bg-nyven-*, text-nyven-*, border-nyven-border, var(--nyven-*)).')
  process.exit(1)
}
console.log('OK: no hard-coded colors outside the allowlist.')
