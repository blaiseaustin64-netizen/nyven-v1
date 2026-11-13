/** Full-screen attachment viewer: PDF canvas preview, text edit, image crop/rotate. */
import { useEffect, useRef, useState } from 'react'
import { X, Pencil, Share2, Download, RotateCw } from 'lucide-react'
import type { AttachmentCardData } from './AttachmentCard'
import { getCachedAttachment } from '../../lib/attachments/fileCache'
import { loadPdfJs, renderPdfPagesToCanvas } from '../../lib/attachments/pdfjsLoader'

function isEditable(item: AttachmentCardData): boolean {
  const mime = item.mimeType || ''
  const name = (item.name || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  if (mime.startsWith('text/') || mime === 'application/json') return true
  if (/\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|yml|yaml)$/i.test(name)) return true
  return false
}

function isPdf(item: AttachmentCardData): boolean {
  return (item.mimeType || '') === 'application/pdf' || (item.name || '').toLowerCase().endsWith('.pdf')
}

function isZip(item: AttachmentCardData): boolean {
  return (item.mimeType || '').includes('zip') || (item.name || '').toLowerCase().endsWith('.zip')
}

function isOffice(item: AttachmentCardData): boolean {
  const n = (item.name || '').toLowerCase()
  return n.endsWith('.docx') || n.endsWith('.xlsx') || (item.mimeType || '').includes('wordprocessingml') || (item.mimeType || '').includes('spreadsheetml')
}

export function AttachmentViewer({
  item,
  open,
  onClose,
  textPreview,
  userId,
  onUseInChat,
  onSaveText,
}: {
  item: AttachmentCardData | null
  open: boolean
  onClose: () => void
  textPreview?: string
  userId?: string
  onUseInChat?: (blob: Blob, name: string) => void
  onSaveText?: (text: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'text'>('view')
  const [text, setText] = useState('')
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [missing, setMissing] = useState(false)
  const [pdfFailed, setPdfFailed] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [aspect, setAspect] = useState<'free' | '1:1' | '4:3' | '16:9'>('free')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !item) return
    setMode('view')
    setRotation(0)
    setText(textPreview || '')
    setMissing(false)
    setPdfFailed(false)
    setBlob(null)
    let revoke: string | null = null
    let url: string | null = item.previewUrl || null
    void (async () => {
      if (item.id && userId) {
        const cached = await getCachedAttachment(item.id, userId)
        if (cached) {
          setBlob(cached.blob)
          revoke = URL.createObjectURL(cached.blob)
          url = revoke
          if ((cached.mime || '').startsWith('text/') || !textPreview) {
            try {
              if (!(cached.mime || '').includes('pdf') && !(cached.mime || '').includes('zip')) {
                const t = await cached.blob.text()
                if (t && !t.includes('\0')) setText(t.slice(0, 200_000))
              }
            } catch {
              /* binary */
            }
          }
        } else if (!item.previewUrl && !textPreview) {
          setMissing(true)
        }
      }
      setObjectUrl(url)
    })()
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [open, item, userId, textPreview])

  // PDF canvas render — never decode as text
  useEffect(() => {
    if (!open || !item || !isPdf(item)) return
    const el = pdfContainerRef.current
    if (!el) return
    let cancelled = false
    void (async () => {
      const lib = await loadPdfJs()
      if (!lib || cancelled) {
        if (!cancelled) setPdfFailed(true)
        return
      }
      try {
        let data: ArrayBuffer | null = null
        if (blob) data = await blob.arrayBuffer()
        else if (objectUrl) {
          const res = await fetch(objectUrl)
          data = await res.arrayBuffer()
        }
        if (!data || cancelled) {
          setPdfFailed(true)
          return
        }
        const result = await renderPdfPagesToCanvas(data, el, 30)
        if (!result.ok) setPdfFailed(true)
      } catch {
        setPdfFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, item, blob, objectUrl])

  if (!open || !item) return null

  const editable = isEditable(item)
  const zip = isZip(item)
  const pdf = isPdf(item)
  const office = isOffice(item)
  const image = (item.mimeType || '').startsWith('image/') || item.kind === 'image'

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: item.name, text: item.name })
    } catch {
      /* */
    }
  }

  const download = () => {
    if (!objectUrl) return
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = item.name || 'download'
    a.click()
  }

  const applyImageEdit = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    let sx = 0
    let sy = 0
    let sw = w
    let sh = h
    const ratioMap = { free: 0, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 } as const
    const target = ratioMap[aspect]
    if (target > 0) {
      const current = w / h
      if (current > target) {
        sw = Math.round(h * target)
        sx = Math.round((w - sw) / 2)
      } else {
        sh = Math.round(w / target)
        sy = Math.round((h - sh) / 2)
      }
    }
    const rad = ((rotation % 360) * Math.PI) / 180
    const swap = rotation % 180 !== 0
    const outW = swap ? sh : sw
    const outH = swap ? sw : sh
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(outW / 2, outH / 2)
    ctx.rotate(rad)
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
    canvas.toBlob(
      (b) => {
        if (!b) return
        onUseInChat?.(b, (item.name || 'image').replace(/(\.\w+)?$/, '-edited$1'))
        onClose()
      },
      item.mimeType || 'image/jpeg',
      0.92
    )
  }

  // Non-editable layouts: zip, failed pdf, office
  if (zip || (pdf && (pdfFailed || mode === 'text')) || office || (!editable && !image && !pdf)) {
    const showText = mode === 'text' || office || (pdf && pdfFailed)
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <header className="h-14 px-3 flex items-center gap-2">
          <button type="button" onClick={onClose} className="w-11 h-11 grid place-items-center" aria-label="Close">
            <X size={22} />
          </button>
          <h2 className="flex-1 text-center text-sm font-medium truncate px-2">{item.name || 'File'}</h2>
          <button type="button" onClick={() => void share()} className="w-11 h-11 grid place-items-center" aria-label="Share">
            <Share2 size={20} />
          </button>
        </header>
        {showText && text ? (
          <pre className="flex-1 overflow-auto p-4 text-sm whitespace-pre-wrap break-words text-[var(--nyven-text)] font-mono">
            {text}
          </pre>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--nyven-hover)] grid place-items-center text-sm tracking-wide">
              {zip ? 'ZIP' : pdf ? 'PDF' : office ? 'DOC' : 'FILE'}
            </div>
            <p className="text-sm text-[var(--nyven-text-secondary)]">Preview unavailable</p>
            {missing && <p className="text-xs text-[var(--nyven-text-secondary)]">Original not available on this device</p>}
            <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
              {objectUrl && (
                <button type="button" onClick={download} className="h-11 rounded-full border border-[var(--nyven-border)] text-sm">
                  Download
                </button>
              )}
              <button type="button" onClick={() => void share()} className="h-11 rounded-full border border-[var(--nyven-border)] text-sm">
                Share
              </button>
              {(text || textPreview) && (
                <button
                  type="button"
                  onClick={() => {
                    setText(text || textPreview || '')
                    setMode('text')
                  }}
                  className="h-11 rounded-full border border-[var(--nyven-border)] text-sm"
                >
                  View extracted text
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // PDF with canvas pages
  if (pdf && !pdfFailed) {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <header className="h-14 px-3 flex items-center gap-2">
          <button type="button" onClick={onClose} className="w-11 h-11 grid place-items-center" aria-label="Close">
            <X size={22} />
          </button>
          <h2 className="flex-1 text-center text-sm font-medium truncate px-2">{item.name || 'PDF'}</h2>
          <button type="button" onClick={() => void share()} className="w-11 h-11 grid place-items-center" aria-label="Share">
            <Share2 size={20} />
          </button>
        </header>
        <div className="flex gap-2 justify-center px-4 pb-2">
          {objectUrl && (
            <button type="button" onClick={download} className="px-3 h-8 rounded-full text-xs border border-[var(--nyven-border)]">
              Download
            </button>
          )}
          {text && (
            <button type="button" onClick={() => setMode('text')} className="px-3 h-8 rounded-full text-xs border border-[var(--nyven-border)]">
              View extracted text
            </button>
          )}
        </div>
        {mode === 'text' ? (
          <pre className="flex-1 overflow-auto p-4 text-sm whitespace-pre-wrap font-mono text-[var(--nyven-text)]">{text}</pre>
        ) : (
          <div ref={pdfContainerRef} className="flex-1 overflow-auto p-4" />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <header className="h-14 px-3 flex items-center justify-end gap-2">
        {editable && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
            className="w-11 h-11 rounded-full bg-[var(--nyven-hover)] grid place-items-center"
            aria-label="Edit"
          >
            <Pencil size={18} />
          </button>
        )}
        <button type="button" onClick={() => void share()} className="w-11 h-11 rounded-full bg-[var(--nyven-hover)] grid place-items-center" aria-label="Share">
          <Share2 size={18} />
        </button>
        <button type="button" onClick={onClose} className="w-11 h-11 rounded-full bg-[var(--nyven-hover)] grid place-items-center" aria-label="Close">
          <X size={18} />
        </button>
      </header>

      {mode === 'edit' && image && (
        <div className="px-4 pb-2 flex flex-wrap gap-2 justify-center">
          {(['free', '1:1', '4:3', '16:9'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAspect(a)}
              className={`px-3 h-8 rounded-full text-xs border ${aspect === a ? 'border-[var(--nyven-border)]' : 'border-[var(--nyven-border)]'}`}
            >
              {a}
            </button>
          ))}
          <button type="button" onClick={() => setRotation((r) => r + 90)} className="px-3 h-8 rounded-full text-xs border border-[var(--nyven-border)] inline-flex items-center gap-1">
            <RotateCw size={14} /> Rotate
          </button>
          <button type="button" onClick={applyImageEdit} className="px-3 h-8 rounded-full text-xs bg-white text-black">
            Use in chat
          </button>
          <button type="button" onClick={download} className="px-3 h-8 rounded-full text-xs border border-[var(--nyven-border)]">
            <Download size={14} className="inline" /> Download
          </button>
        </div>
      )}

      {mode === 'edit' && !image && (
        <div className="px-4 pb-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              onSaveText?.(text)
              setMode('view')
            }}
            className="px-3 h-8 rounded-full text-xs bg-white text-black"
          >
            Save
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4">
        {missing && !objectUrl && !text ? (
          <p className="text-sm text-[var(--nyven-text-secondary)]">Original not available on this device</p>
        ) : image && objectUrl ? (
          <>
            <img
              ref={imgRef}
              src={objectUrl}
              alt={item.name}
              className="max-w-full max-h-full object-contain"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
            <canvas ref={canvasRef} className="hidden" />
          </>
        ) : mode === 'edit' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full max-w-3xl h-full min-h-[50vh] bg-transparent text-sm font-mono text-[var(--nyven-text)] outline-none resize-none"
          />
        ) : (
          <pre className="w-full max-w-3xl text-sm whitespace-pre-wrap break-words text-[var(--nyven-text)] font-mono">
            {text || 'No preview available.'}
          </pre>
        )}
      </div>
    </div>
  )
}
