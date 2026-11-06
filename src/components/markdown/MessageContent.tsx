/**
 * NYVEN message content — react-markdown + GFM + sanitize.
 * Secure rendering only (no arbitrary HTML). Syntax highlight via highlight.js/core.
 */
import { useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { Check, Copy } from 'lucide-react'
import clsx from 'clsx'
import type { Components } from 'react-markdown'

type Props = {
  content: string
  isStreaming?: boolean
  className?: string
}

function safeHref(href: string | undefined): string | null {
  if (!href) return null
  const h = href.trim()
  const lower = h.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return null
  }
  if (/^https?:\/\//i.test(h) || h.startsWith('/') || h.startsWith('#') || h.startsWith('mailto:')) {
    return h
  }
  return null
}

const LANG_ALIAS: Record<string, string> = {
  html: 'xml',
  vue: 'xml',
  svg: 'xml',
  jsx: 'javascript',
  tsx: 'typescript',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
}

const REGISTERED = [
  'xml',
  'css',
  'javascript',
  'typescript',
  'json',
  'bash',
  'python',
  'sql',
  'markdown',
  'yaml',
  'diff',
  'plaintext',
] as const

let hljsPromise: Promise<typeof import('highlight.js/lib/core').default> | null = null

async function getHljs() {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const hljs = (await import('highlight.js/lib/core')).default
      const loaders: Array<[string, () => Promise<{ default: any }>]> = [
        ['xml', () => import('highlight.js/lib/languages/xml')],
        ['css', () => import('highlight.js/lib/languages/css')],
        ['javascript', () => import('highlight.js/lib/languages/javascript')],
        ['typescript', () => import('highlight.js/lib/languages/typescript')],
        ['json', () => import('highlight.js/lib/languages/json')],
        ['bash', () => import('highlight.js/lib/languages/bash')],
        ['python', () => import('highlight.js/lib/languages/python')],
        ['sql', () => import('highlight.js/lib/languages/sql')],
        ['markdown', () => import('highlight.js/lib/languages/markdown')],
        ['yaml', () => import('highlight.js/lib/languages/yaml')],
        ['diff', () => import('highlight.js/lib/languages/diff')],
        ['plaintext', () => import('highlight.js/lib/languages/plaintext')],
      ]
      for (const [name, load] of loaders) {
        try {
          const mod = await load()
          hljs.registerLanguage(name, mod.default)
        } catch {
          /* optional */
        }
      }
      return hljs
    })()
  }
  return hljsPromise
}

function resolveLang(raw?: string): string | undefined {
  if (!raw) return undefined
  const key = raw.trim().toLowerCase()
  const mapped = LANG_ALIAS[key] || key
  if ((REGISTERED as readonly string[]).includes(mapped)) return mapped
  return undefined
}

function CodeBlock({
  code,
  language,
  isStreaming,
}: {
  code: string
  language?: string
  isStreaming?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const [wrap, setWrap] = useState(true)
  const label = (language || 'code').trim() || 'code'
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onCopy = useCallback(async () => {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    } catch {
      /* fallback */
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = code
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        setCopyError(true)
        setTimeout(() => setCopyError(false), 2000)
      }
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }, [code])

  useEffect(() => {
    // Skip live re-highlight on every stream token; wait for closed fence or debounce
    const closedEnough = !isStreaming || code.includes('\n')
    if (isStreaming && !closedEnough) {
      setHtml(null)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    const delay = isStreaming ? 300 : 0
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const hljs = await getHljs()
          const lang = resolveLang(language)
          let out: string
          if (lang && hljs.getLanguage(lang)) {
            out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
          } else if (!language) {
            out = hljs.highlightAuto(code, [...REGISTERED]).value
          } else {
            setHtml(null)
            return
          }
          setHtml(out)
        } catch {
          setHtml(null)
        }
      })()
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [code, language, isStreaming])

  return (
    <div className="my-3 rounded-xl border border-white/[0.08] bg-[#0a0c12] overflow-hidden min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.03]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-nyven-text-secondary truncate">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            className="hidden sm:inline-flex text-[11px] text-nyven-text-secondary hover:text-nyven-text px-2 py-1.5 rounded-lg hover:bg-white/[0.06] min-h-[44px] sm:min-h-0"
            aria-label={wrap ? 'Scroll long lines' : 'Wrap long lines'}
          >
            {wrap ? 'Unwrap' : 'Wrap'}
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex items-center gap-1.5 text-[12px] text-nyven-text-secondary hover:text-nyven-text px-2 py-1.5 rounded-lg hover:bg-white/[0.06] min-h-[44px] sm:min-h-0"
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? <Check size={14} className="text-nyven-cyan" /> : <Copy size={14} />}
            <span>{copyError ? 'Failed' : copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre
        className={clsx(
          'p-3 m-0 text-[13px] leading-relaxed font-mono text-nyven-text/95 max-w-full nyven-code-pre',
          wrap
            ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere] overflow-x-hidden'
            : 'overflow-x-auto whitespace-pre [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        {html ? (
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="whitespace-inherit">{code}</code>
        )}
      </pre>
    </div>
  )
}

export function MessageContent({ content, isStreaming, className }: Props) {
  const components: Components = useMemo(
    () => ({
      p: ({ children }) => (
        <p className="mb-3 last:mb-0 text-[16px] leading-[1.65] text-nyven-text [overflow-wrap:anywhere]">
          {children}
        </p>
      ),
      h1: ({ children }) => (
        <h1 className="font-display text-xl font-semibold mt-6 mb-3 text-nyven-text first:mt-0">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="font-display text-lg font-semibold mt-6 mb-3 text-nyven-text first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="font-display text-base font-semibold mt-6 mb-2 text-nyven-text first:mt-0">
          {children}
        </h3>
      ),
      ul: ({ children }) => (
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-[16px] leading-[1.65]">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-[16px] leading-[1.65]">{children}</ol>
      ),
      li: ({ children }) => <li className="[overflow-wrap:anywhere] pl-0.5">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-nyven-violet/40 pl-3 text-nyven-text-secondary">
          {children}
        </blockquote>
      ),
      a: ({ href, children }) => {
        const safe = safeHref(href)
        if (!safe) return <span>{children}</span>
        return (
          <a
            href={safe}
            target={safe.startsWith('http') ? '_blank' : undefined}
            rel={safe.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-nyven-violet underline underline-offset-2 hover:text-nyven-cyan break-words [overflow-wrap:anywhere]"
          >
            {children}
          </a>
        )
      },
      table: ({ children }) => (
        <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/[0.08] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <table className="min-w-full text-sm text-left">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
      th: ({ children }) => (
        <th className="px-3 py-2 font-medium text-nyven-text border-b border-white/[0.06]">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="px-3 py-2 text-nyven-text-secondary border-b border-white/[0.04] align-top">
          {children}
        </td>
      ),
      hr: () => <hr className="my-4 border-white/[0.08]" />,
      strong: ({ children }) => <strong className="font-semibold text-nyven-text">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      code: ({ className: cls, children, ...props }) => {
        const match = /language-([\w-]+)/.exec(cls || '')
        const isBlock = Boolean(match) || (cls || '').includes('language-')
        // react-markdown passes inline code without language- and often as string children
        const raw = String(children ?? '').replace(/\n$/, '')
        // Detect fenced block: parent is pre (handled by pre) — for code inside pre, skip
        if ((props as { node?: { position?: unknown } }).node && isBlock) {
          return (
            <CodeBlock code={raw} language={match?.[1]} isStreaming={isStreaming} />
          )
        }
        // Inline vs block: if class has language-, treat as block body only when not nested wrongly
        if (match) {
          return <CodeBlock code={raw} language={match[1]} isStreaming={isStreaming} />
        }
        return (
          <code
            className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[0.9em] text-nyven-cyan font-mono break-all"
          >
            {children}
          </code>
        )
      },
      pre: ({ children }) => {
        // Prefer extracting code child
        const child = Array.isArray(children) ? children[0] : children
        if (
          child &&
          typeof child === 'object' &&
          'props' in (child as object)
        ) {
          const props = (child as { props?: { className?: string; children?: ReactNode } }).props
          const cls = props?.className || ''
          const match = /language-([\w-]+)/.exec(cls)
          const raw = String(props?.children ?? '').replace(/\n$/, '')
          return <CodeBlock code={raw} language={match?.[1]} isStreaming={isStreaming} />
        }
        return <CodeBlock code={String(children ?? '')} isStreaming={isStreaming} />
      },
    }),
    [isStreaming]
  )

  return (
    <div
      className={clsx(
        'nyven-md min-w-0 max-w-full text-[16px] leading-[1.65] text-nyven-text',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-nyven-cyan/80 animate-pulse rounded-sm"
          aria-hidden
        />
      )}
    </div>
  )
}
