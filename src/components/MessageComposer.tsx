import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send,
  Plus,
  Mic,
  Square,
  X,
  FileText,
  Image as ImageIcon,
  File,
  Loader2,
  AudioLines,
} from 'lucide-react'
import { MicWaveCircle } from './MicWaveCircle'
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
  /** Dictation mic (push-to-talk style in normal chat) */
  onVoiceToggle?: () => void
  voicePhase?: 'idle' | 'requesting_permission' | 'listening' | 'transcribing' | 'speaking' | 'error'
  voiceEnergy?: number
  liquidMode?: 'idle' | 'listening' | 'speaking' | 'thinking'
  /** Insert a dictation transcript into the normal composer. */
  voiceDraft?: { id: number; text: string } | null
  /** Open full-screen Voice Chat */
  onOpenVoiceChat?: () => void
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

type MenuKind = 'any' | 'image' | 'document' | 'pdf'

const ACCEPT: Record<MenuKind, string> = {
  any: '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.json,.csv,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,application/json,text/csv',
  image: '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif',
  document: '.txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv',
  pdf: '.pdf,application/pdf',
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
  voiceDraft = null,
  onOpenVoiceChat,
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const acceptRef = useRef<MenuKind>('any')
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) textareaRef.current.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!voiceDraft) return
    setValue(voiceDraft.text)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [voiceDraft])

  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
        a.abortController?.abort()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close attachment menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || plusRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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
        setComposerError('This file type is not supported.')
        return
      }
      if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
        setComposerError(`File exceeds the ${formatSize(ATTACHMENT_LIMITS.MAX_FILE_SIZE)} limit.`)
        return
      }

      setAttachments((prev) => {
        if (prev.length >= ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE) {
          setComposerError(`You can attach up to ${ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE} files.`)
          return prev
        }
        const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const kind = kindForMime(file.type || ALLOWED_EXTENSIONS[extensionOf(file.name)] || "")
        const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined
        const abortController = new AbortController()
        const pending: PendingAttachment = {
          id,
          file,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind,
          status: 'uploading',
          previewUrl,
          abortController,
        }

        void (async () => {
          try {
            updateAttachment(id, { status: 'processing' })
            const form = new FormData()
            form.append('file', file)
            const res = await fetch('/api/attachments', {
              method: 'POST',
              body: form,
              signal: abortController.signal,
            })
            const data = (await res.json().catch(() => ({}))) as {
              success?: boolean
              error?: string
              attachment?: {
                extractedText?: string
                inlineBase64?: string
                mimeType?: string
                kind?: PendingAttachment['kind']
              }
              extractedText?: string
              inlineBase64?: string
              mimeType?: string
              kind?: PendingAttachment['kind']
            }
            if (!res.ok || !data.success) {
              updateAttachment(id, {
                status: 'error',
                error: data.error || 'Could not process this file.',
              })
              return
            }
            const att = data.attachment || data
            updateAttachment(id, {
              status: 'ready',
              extractedText: att.extractedText,
              inlineBase64: att.inlineBase64,
              mimeType: att.mimeType || file.type,
              kind: att.kind || kind,
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
      for (const f of Array.from(files)) void uploadFile(f)
    },
    [uploadFile]
  )

  const openPicker = (kind: MenuKind) => {
    acceptRef.current = kind
    setMenuOpen(false)
    // Update accept then open
    requestAnimationFrame(() => {
      if (fileInputRef.current) {
        fileInputRef.current.accept = ACCEPT[kind]
        fileInputRef.current.click()
      }
    })
  }

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
    setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const canSend =
    !isGenerating &&
    (value.trim().length > 0 || attachments.some((a) => a.status === 'ready')) &&
    !attachments.some((a) => a.status === 'uploading' || a.status === 'processing')

  const visibleAttachments = attachments.filter((a) => a.status !== 'cancelled')

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4">
      {composerError && (
        <p className="text-xs text-red-300/90 mb-2 px-1" role="alert">
          {composerError}
        </p>
      )}

      {visibleAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {visibleAttachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-2 max-w-[220px] rounded-xl border border-white/[0.08] bg-nyven-surface/80 pl-2 pr-1.5 py-1.5"
            >
              {a.kind === 'image' && a.previewUrl ? (
                <img
                  src={a.previewUrl}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover shrink-0"
                />
              ) : a.name.toLowerCase().endsWith('.pdf') ? (
                <div className="h-9 w-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-nyven-cyan/80" />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                  <File size={16} className="text-nyven-text-secondary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-nyven-text truncate leading-tight">{a.name}</p>
                <p className="text-[10px] text-nyven-text-secondary/70">
                  {a.status === 'ready'
                    ? formatSize(a.size)
                    : a.status === 'error'
                      ? a.error || 'Error'
                      : a.status === 'processing' || a.status === 'uploading'
                        ? 'Processing…'
                        : formatSize(a.size)}
                </p>
              </div>
              {(a.status === 'uploading' || a.status === 'processing') && (
                <Loader2 size={14} className="animate-spin text-nyven-text-secondary shrink-0" />
              )}
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="p-1 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.06] shrink-0"
                aria-label={`Remove ${a.name}`}
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
          'relative rounded-2xl border bg-nyven-surface/90 backdrop-blur-sm transition-colors',
          dragOver
            ? 'border-nyven-cyan/40 bg-nyven-cyan/[0.04]'
            : 'border-white/[0.08] focus-within:border-white/[0.14]'
        )}
      >
        {/* Attachment menu */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute left-2 bottom-full mb-2 z-30 w-52 origin-bottom-left rounded-xl border border-white/[0.1] bg-[#0c1018]/95 backdrop-blur-md shadow-xl shadow-black/40 p-1.5 animate-in fade-in zoom-in-95"
            style={{
              animation: 'nyvenMenuIn 160ms ease-out',
            }}
            role="menu"
            aria-label="Attach"
          >
            <style>{`
              @keyframes nyvenMenuIn {
                from { opacity: 0; transform: scale(0.96) translateY(4px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>
            {(
              [
                { kind: 'any' as MenuKind, label: 'Upload file', icon: File },
                { kind: 'image' as MenuKind, label: 'Upload image', icon: ImageIcon },
                { kind: 'document' as MenuKind, label: 'Document', icon: FileText },
                { kind: 'pdf' as MenuKind, label: 'PDF', icon: FileText },
              ] as const
            ).map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                onClick={() => openPicker(item.kind)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-nyven-text hover:bg-white/[0.06] transition-colors text-left"
              >
                <item.icon size={16} className="text-nyven-text-secondary shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1 px-2 py-2 sm:px-2.5 sm:py-2.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPT.any}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <button
            ref={plusRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={isGenerating}
            className={clsx(
              'shrink-0 p-2 rounded-xl transition-colors disabled:opacity-40',
              menuOpen
                ? 'text-nyven-cyan bg-nyven-cyan/10'
                : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]'
            )}
            aria-label="Attach"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Attach"
          >
            <Plus size={18} />
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

          <div className="flex items-center gap-0.5 shrink-0">
            {/* Dictation mic — circular wave when listening (not full Liquid Voice) */}
            {voicePhase === 'listening' ? (
              <MicWaveCircle
                active
                energy={voiceEnergy}
                size={40}
                onClick={onVoiceToggle}
                label="Stop listening"
              />
            ) : (
              <button
                type="button"
                onClick={onVoiceToggle}
                disabled={!onVoiceToggle || isGenerating}
                className={clsx(
                  'p-2 rounded-xl transition-colors',
                  voicePhase === 'speaking' && 'text-nyven-cyan bg-nyven-cyan/10',
                  voicePhase === 'transcribing' && 'text-nyven-text-secondary',
                  (voicePhase === 'idle' ||
                    voicePhase === 'error' ||
                    voicePhase === 'requesting_permission') &&
                    'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]',
                  (!onVoiceToggle || isGenerating) && 'opacity-40 cursor-not-allowed'
                )}
                aria-label={
                  voicePhase === 'speaking'
                    ? 'Stop speaking'
                    : voicePhase === 'transcribing'
                      ? 'Transcribing'
                      : 'Dictate'
                }
                title={
                  voicePhase === 'speaking'
                    ? 'Stop speaking'
                    : voicePhase === 'transcribing'
                      ? 'Transcribing…'
                      : 'Dictate into chat'
                }
              >
                {voicePhase === 'transcribing' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Mic size={18} />
                )}
              </button>
            )}

            {/* Full-screen Voice Chat */}
            <button
              type="button"
              onClick={onOpenVoiceChat}
              disabled={!onOpenVoiceChat || isGenerating}
              className={clsx(
                'p-2 rounded-xl transition-colors text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]',
                (!onOpenVoiceChat || isGenerating) && 'opacity-40 cursor-not-allowed'
              )}
              aria-label="Open voice chat"
              title="Voice chat"
            >
              <AudioLines size={18} />
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
      </div>
      <p className="text-center text-[11px] text-nyven-text-secondary/50 mt-2">NYVEN</p>
    </div>
  )
}
