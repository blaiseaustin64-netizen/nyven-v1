/**
 * NYVEN message content renderer.
 * Secure Markdown subset → React elements only (no raw HTML injection).
 */
import { useMemo, useState, useCallback, useEffect, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import clsx from 'clsx'

function safeHref(href: string): string | null {
  const h = (href || '').trim()
  if (!h) return null
  const lower = h.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return null
  }
  if (/^https?:\/\//i.test(h) || h.startsWith('/') || h.startsWith('#') || h.startsWith('mailto:')) {
    return h
  }
  return null
}

type Props = {
  content: string
  isStreaming?: boolean
  className?: string
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re =
    /(`[^`]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>\[\]()]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last, m.index)}</span>)
    }
    const [full, code, bold, italic, mdLink, bareUrl] = m
    if (code) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i++}`}
          className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[0.9em] text-nyven-cyan font-mono break-all"
        >
          {code.slice(1, -1)}
        </code>
      )
    } else if (bold) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-nyven-text">
          {renderInline(bold.slice(2, -2), `${keyPrefix}-bi${i}`)}
        </strong>
      )
    } else if (italic) {
      nodes.push(
        <em key={`${keyPrefix}-i${i++}`} className="italic text-nyven-text">
          {renderInline(italic.slice(1, -1), `${keyPrefix}-ii${i}`)}
        </em>
      )
    } else if (mdLink) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(mdLink)
      if (lm) {
        const href = safeHref(lm[2])
        if (href) {
          nodes.push(
            <a
              key={`${keyPrefix}-a${i++}`}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-nyven-violet underline underline-offset-2 hover:text-nyven-cyan break-words [overflow-wrap:anywhere]"
            >
              {lm[1]}
            </a>
          )
        } else {
          nodes.push(<span key={`${keyPrefix}-a${i++}`}>{lm[1]}</span>)
        }
      }
    } else if (bareUrl) {
      const clean = bareUrl.replace(/[.,;:!?)]+$/, '')
      const trail = bareUrl.slice(clean.length)
      nodes.push(
        <a
          key={`${keyPrefix}-u${i++}`}
          href={clean}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nyven-violet underline underline-offset-2 hover:text-nyven-cyan break-words [overflow-wrap:anywhere]"
        >
          {clean}
        </a>
      )
      if (trail) nodes.push(<span key={`${keyPrefix}-ut${i++}`}>{trail}</span>)
    } else {
      nodes.push(<span key={`${keyPrefix}-f${i++}`}>{full}</span>)
    }
    last = m.index + full.length
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyPrefix}-end`}>{text.slice(last)}</span>)
  }
  return nodes
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const label = (language || 'code').trim() || 'code'
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [code])

  // Lightweight syntax highlighting via highlight.js when available
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hljs = (await import('highlight.js')).default
        const lang = label.toLowerCase()
        const mapped =
          lang === 'js'
            ? 'javascript'
            : lang === 'ts'
              ? 'typescript'
              : lang === 'sh' || lang === 'shell'
                ? 'bash'
                : lang === 'html'
                  ? 'xml'
                  : lang
        let out: string
        if (mapped && hljs.getLanguage(mapped)) {
          out = hljs.highlight(code, { language: mapped, ignoreIllegals: true }).value
        } else {
          out = hljs.highlightAuto(code).value
        }
        if (!cancelled) setHtml(out)
      } catch {
        if (!cancelled) setHtml(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, label])

  return (
    <div className="my-3 rounded-xl border border-white/[0.08] bg-[#0a0c12] overflow-hidden min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.03]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-nyven-text-secondary truncate">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 text-[12px] text-nyven-text-secondary hover:text-nyven-text px-2 py-1.5 rounded-lg hover:bg-white/[0.06] min-h-[44px] sm:min-h-0"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check size={14} className="text-nyven-cyan" /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 m-0 text-[13px] leading-relaxed font-mono text-nyven-text/95 max-w-full nyven-code-pre">
        {html ? (
          <code className="hljs whitespace-pre" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="whitespace-pre">{code}</code>
        )}
      </pre>
    </div>
  )
}

type Block =
  | { type: 'code'; language: string; code: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'p'; text: string }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    const fence = /^```([\w+-]*)\s*$/.exec(line)
    if (fence) {
      const language = fence[1] || ''
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      if (i < lines.length && /^```\s*$/.test(lines[i])) i++
      blocks.push({ type: 'code', language, code: body.join('\n') })
      continue
    }

    const h = /^(#{1,6})\s+(.+)$/.exec(line)
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() })
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    if (line.startsWith('> ')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        q.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'quote', text: q.join(' ') })
      continue
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|/.test(lines[i + 1] || '')
    ) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headers = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      if (
        lines[i].includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:-]+\|/.test(lines[i + 1] || '')
      ) {
        break
      }
      para.push(lines[i])
      i++
    }
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ') })
    } else {
      i++
    }
  }
  return blocks
}

const headingClass: Record<number, string> = {
  1: 'text-xl font-semibold mt-6 mb-3 first:mt-0',
  2: 'text-lg font-semibold mt-5 mb-2.5 first:mt-0',
  3: 'text-base font-semibold mt-4 mb-2 first:mt-0',
  4: 'text-[15px] font-semibold mt-3 mb-1.5 first:mt-0',
  5: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
  6: 'text-sm font-medium mt-2 mb-1 first:mt-0',
}

export function MessageContent({ content, isStreaming, className }: Props) {
  const blocks = useMemo(() => parseBlocks(content || ''), [content])

  return (
    <div
      className={clsx(
        'nyven-md text-[15px] leading-[1.65] text-nyven-text min-w-0 max-w-full break-words [overflow-wrap:anywhere]',
        className
      )}
    >
      {blocks.map((b, idx) => {
        if (b.type === 'code') {
          return <CodeBlock key={idx} code={b.code} language={b.language} />
        }
        if (b.type === 'heading') {
          const Tag = (`h${Math.min(b.level, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')
          return (
            <Tag key={idx} className={clsx(headingClass[b.level], 'text-nyven-text')}>
              {renderInline(b.text, `h${idx}`)}
            </Tag>
          )
        }
        if (b.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="my-3 border-l-2 border-nyven-violet/50 pl-3 text-nyven-text-secondary"
            >
              {renderInline(b.text, `q${idx}`)}
            </blockquote>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={idx} className="my-3 pl-5 list-disc space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, `ul${idx}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={idx} className="my-3 pl-5 list-decimal space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, `ol${idx}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        if (b.type === 'table') {
          return (
            <div
              key={idx}
              className="my-3 overflow-x-auto max-w-full rounded-xl border border-white/[0.08]"
            >
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-white/[0.04]">
                    {b.headers.map((h, j) => (
                      <th
                        key={j}
                        className="px-3 py-2 text-left font-semibold border-b border-white/[0.08] whitespace-nowrap"
                      >
                        {renderInline(h, `th${idx}-${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-white/[0.05] last:border-0">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 align-top">
                          {renderInline(cell, `td${idx}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (b.type === 'hr') {
          return <hr key={idx} className="my-4 border-white/[0.08]" />
        }
        return (
          <p key={idx} className="my-3 first:mt-0 last:mb-0">
            {renderInline(b.text, `p${idx}`)}
            {isStreaming && idx === blocks.length - 1 ? (
              <span className="inline-block w-1.5 h-1.5 ml-1 rounded-full bg-nyven-cyan animate-pulse align-middle" />
            ) : null}
          </p>
        )
      })}
      {isStreaming && blocks.length === 0 ? (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-nyven-cyan animate-pulse" />
      ) : null}
    </div>
  )
}
