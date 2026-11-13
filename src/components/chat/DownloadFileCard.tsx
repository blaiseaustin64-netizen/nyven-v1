import { useState } from 'react'
import { Download, FileArchive, FileText, Link2 } from 'lucide-react'

export type DownloadFileMeta = {
  id: string
  name: string
  mimeType: string
  size: number
  /** Object URL or data URL for download (session) */
  href?: string
  /** Base64 payload persisted with the message when small */
  base64?: string
}

function iconFor(name: string, mime: string) {
  if (name.endsWith('.zip') || mime.includes('zip')) return FileArchive
  return FileText
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DownloadFileCard({
  file,
  onOpen,
}: {
  file: DownloadFileMeta
  onOpen?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const Icon = iconFor(file.name, file.mimeType)

  const download = async () => {
    setBusy(true)
    try {
      let href = file.href
      if (!href && file.base64) {
        href = `data:${file.mimeType};base64,${file.base64}`
      }
      if (!href) return
      const a = document.createElement('a')
      a.href = href
      a.download = file.name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      setTimeout(() => setBusy(false), 400)
    }
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: file.name, text: file.name })
      }
    } catch {
      /* */
    }
  }

  return (
    <div className="my-2 max-w-sm rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[var(--nyven-input-bg)]"
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--nyven-bg-secondary)] grid place-items-center shrink-0">
          <Icon size={18} className="text-[var(--nyven-cyan)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[var(--nyven-text)] truncate">{file.name}</p>
          <p className="text-[12px] text-[var(--nyven-text-secondary)]">{formatSize(file.size)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              void share()
            }}
            className="w-9 h-9 rounded-full grid place-items-center text-[var(--nyven-text-secondary)] hover:bg-[var(--nyven-surface)]"
            aria-label="Share"
          >
            <Link2 size={16} />
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              void download()
            }}
            className="w-9 h-9 rounded-full grid place-items-center text-[var(--nyven-text-secondary)] hover:bg-[var(--nyven-surface)]"
            aria-label="Download"
          >
            {busy ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-[var(--nyven-cyan)] animate-spin" />
            ) : (
              <Download size={16} />
            )}
          </span>
        </div>
      </button>
    </div>
  )
}
