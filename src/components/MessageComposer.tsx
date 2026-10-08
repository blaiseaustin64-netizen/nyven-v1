import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Paperclip, Mic, Square, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { ATTACHMENT_LIMITS, extensionOf, ALLOWED_EXTENSIONS, kindForMime } from '../lib/attachments/limits'
import type { PendingAttachment, AttachmentPayload } from '../lib/attachments/types'

export type ComposerSendPayload = {
  text: string
  attachments: AttachmentPayload[]
}

interface MessageComposerProps {
  onSend: (payload: ComposerSendPayload) => void
  isGenerating?: boolean
  onStop?: () => void
  placeholder?: string
  autoFocus?: boolean
  /** Voice mic toggle */
  onVoiceToggle?: () => void
  voicePhase?: 'idle' | 'requesting_permission' | 'listening' | 'transcribing' | 'speaking' | 'error'
  voiceEnergy?: number
  liquidMode?: 'idle' | 'listening' | 'speaking'
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function isAllowedFile(file: File): boolean {
  const ext = extensionOf(file.name)
  return Boolean(ALLOWED_EXTENSIONS[ext])
}

export function MessageComposer({
  onSend,
  isGenerating = false,
  onStop,
  placeholder = 'Message NYVEN...',
  autoFocus = false,
  onVoiceToggle,
  voicePhase = 'idle',
  voiceEnergy = 0,
  liquidMode = 'idle',
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) textareaRef.current.focus()
  }, [autoFocus])

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
        a.abortController?.abort()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateAttachment = useCallback((id: string, patch: Partial<PendingAttachment>) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      target?.abortController?.abort()
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const uploadFile = useCallback(
    async (file: File) => {
      setComposerError(null)

      if (!isAllowedFile(file)) {
        setComposerError('Unsupported file type. Use PNG, JPEG, WEBP, GIF, PDF, TXT, MD, JSON, or CSV.')
        return
      }
      if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
        setComposerError(
          `Each file must be under ${Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024))} MB.`
        )
        return
      }

      setAttachments((prev) => {
        if (prev.length >= ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE) {
          setComposerError(`You can attach up to ${ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE} files.`)
          return prev
        }
        const total = prev.reduce((s, a) => s + a.size, 0) + file.size
        if (total > ATTACHMENT_LIMITS.MAX_TOTAL_UPLOAD_SIZE) {
          setComposerError('Total attachment size is too large for one message.')
          return prev
        }

        const ext = extensionOf(file.name)
        const mime = ALLOWED_EXTENSIONS[ext] || file.type
        const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        const abortController = new AbortController()
        const previewUrl = mime.startsWith('image/') ? URL.createObjectURL(file) : undefined

        const pending: PendingAttachment = {
          id,
          name: file.name,
          mimeType: mime,
          size: file.size,
          kind: kindForMime(mime),
          status: 'uploading',
          previewUrl,
          abortController,
        }

        // Start upload async
        ;(async () => {
          try {
            updateAttachment(id, { status: 'processing' })
            const form = new FormData()
            form.append('file', file, file.name)
            const res = await fetch('/api/attachments', {
              method: 'POST',
              body: form,
              signal: abortController.signal,
            })
            const data = await res.json()
            if (!res.ok || !data.success || !data.attachment) {
              updateAttachment(id, {
                status: 'error',
                error: data.error || 'Upload failed.',
              })
              return
            }
            const att = data.attachment
            updateAttachment(id, {
              id: att.id,
              status: 'ready',
              extractedText: att.extractedText,
              inlineBase64: att.inlineBase64,
              mimeType: att.mimeType,
              kind: att.kind,
              error: undefined,
            })
          } catch (err: unknown) {
            if ((err as { name?: string })?.name === 'AbortError') {
              updateAttachment(id, { status: 'cancelled' })
              return
            }
            updateAttachment(id, {
              status: 'error',
              error: 'Could not process this file.',
            })
          }
        })()

        return [...prev, pending]
      })
    },
    [updateAttachment]
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      for (const f of list) {
        void uploadFile(f)
      }
    },
    [uploadFile]
  )

  const handleSubmit = () => {
    const trimmed = value.trim()
    const ready = attachments.filter((a) => a.status === 'ready')
    const busy = attachments.some((a) => a.status === 'uploading' || a.status === 'processing')
    if (busy) {
      setComposerError('Wait for attachments to finish processing.')
      return
    }
    if ((!trimmed && ready.length === 0) || isGenerating) return

    const payload: AttachmentPayload[] = ready.map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      kind: a.kind,
      extractedText: a.extractedText,
      inlineBase64: a.inlineBase64,
    }))

    onSend({ text: trimmed, attachments: payload })
    setValue('')
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
    })
    setAttachments([])
    setComposerError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) imageFiles.push(f)
      }
    }
    if (imageFiles.length) {
      e.preventDefault()
      addFiles(imageFiles)
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const canSend =
    !isGenerating &&
    (value.trim().length > 0 || attachments.some((a) => a.status === 'ready')) &&
    !attachments.some((a) => a.status === 'uploading' || a.status === 'processing')

  return (
    <div className="border-t border-white/[0.05] bg-nyven-bg/80 backdrop-blur-md safe-bottom">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">
        {composerError && (
          <p className="text-xs text-red-300 mb-2 px-1">{composerError}</p>
        )}

        {(liquidMode === 'listening' || liquidMode === 'speaking') && (
          <div className="flex items-center gap-3 mb-2 px-1">
            {/* LiquidVoice injected from Chat via portal-free sibling — rendered by parent if needed */}
            <span className="text-[11px] text-nyven-text-secondary tracking-wide">
              {liquidMode === 'listening' ? 'Listening…' : 'Speaking…'}
            </span>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="relative flex items-center gap-2 max-w-[220px] rounded-xl border border-white/[0.08] bg-nyven-surface px-2 py-1.5"
              >
                {a.kind === 'image' && a.previewUrl ? (
                  <img
                    src={a.previewUrl}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                ) : a.kind === 'image' ? (
                  <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                    <ImageIcon size={16} className="text-nyven-text-secondary" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-nyven-text-secondary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate text-nyven-text">{a.name}</div>
                  <div className="text-[10px] text-nyven-text-secondary flex items-center gap-1">
                    {(a.status === 'uploading' || a.status === 'processing') && (
                      <Loader2 size={10} className="animate-spin" />
                    )}
                    {a.status === 'ready' && formatSize(a.size)}
                    {a.status === 'uploading' && 'Uploading…'}
                    {a.status === 'processing' && 'Processing…'}
                    {a.status === 'error' && (a.error || 'Failed')}
                    {a.status === 'cancelled' && 'Cancelled'}
                    {a.status === 'queued' && 'Queued'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="p-1 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.06]"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={clsx(
            'relative flex items-end gap-2 bg-nyven-surface border rounded-2xl px-3 py-2.5 transition-colors duration-200',
            dragOver ? 'border-nyven-cyan/50 bg-nyven-cyan/5' : 'border-white/[0.07]'
          )}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 rounded-2xl flex items-center justify-center bg-nyven-bg/40 z-10">
              <span className="text-sm text-nyven-cyan font-medium">Drop files to attach</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.json,.csv,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,application/json,text/csv"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            className="shrink-0 p-2 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors disabled:opacity-40"
            aria-label="Attach file"
            title="Attach files"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            disabled={isGenerating}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-[15px] leading-relaxed text-nyven-text placeholder:text-nyven-text-secondary/70 max-h-40 py-1.5"
            style={{ minHeight: '24px' }}
          />

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onVoiceToggle}
              disabled={!onVoiceToggle || isGenerating}
              className={clsx(
                'p-2 rounded-xl transition-colors',
                voicePhase === 'listening' && 'text-nyven-cyan bg-nyven-cyan/10',
                voicePhase === 'speaking' && 'text-nyven-cyan bg-nyven-cyan/10',
                voicePhase === 'transcribing' && 'text-nyven-text-secondary',
                (voicePhase === 'idle' || voicePhase === 'error' || voicePhase === 'requesting_permission') &&
                  'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]',
                (!onVoiceToggle || isGenerating) && 'opacity-40 cursor-not-allowed'
              )}
              aria-label={
                voicePhase === 'listening'
                  ? 'Stop listening'
                  : voicePhase === 'speaking'
                    ? 'Stop speaking'
                    : 'Start voice input'
              }
              title={
                voicePhase === 'listening'
                  ? 'Tap to send'
                  : voicePhase === 'speaking'
                    ? 'Stop speaking'
                    : 'Voice input'
              }
            >
              <Mic size={18} />
            </button>

            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="p-2 rounded-xl bg-nyven-surface text-nyven-text hover:bg-white/[0.08] transition-colors"
                aria-label="Stop generating"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend}
                className={clsx(
                  'p-2 rounded-xl transition-all duration-200',
                  canSend
                    ? 'bg-nyven-cyan text-nyven-bg hover:bg-nyven-cyan/90'
                    : 'bg-white/[0.06] text-nyven-text-secondary cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-nyven-text-secondary/50 mt-2">NYVEN</p>
      </div>
    </div>
  )
}
