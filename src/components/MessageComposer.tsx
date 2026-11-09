import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Camera,
  FolderOpen,
  ChevronRight,
} from 'lucide-react'
import { MicWaveCircle } from './MicWaveCircle'
import clsx from 'clsx'
import { ATTACHMENT_LIMITS, extensionOf, ALLOWED_EXTENSIONS, kindForMime } from '../lib/attachments/limits'
import type { PendingAttachment, AttachmentPayload } from '../lib/attachments/types'
import { extractAttachmentFile } from '../lib/attachments/extract'
import { cacheAttachmentBlob } from '../lib/attachments/fileCache'

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
  /** Open full-screen Voice Chat */
  onOpenVoiceChat?: () => void
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Resize/compress images client-side before upload (longest side 1600, JPEG 0.82). */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    let { width, height } = bitmap
    if (width <= max && height <= max && file.size < 900_000) {
      bitmap.close()
      return file
    }
    const scale = Math.min(1, max / Math.max(width, height))
    width = Math.round(width * scale)
    height = Math.round(height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
    )
    if (!blob) return file
    const name = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, '.jpg')
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

function isAllowedFile(file: File): boolean {
  const ext = extensionOf(file.name)
  return Boolean(ALLOWED_EXTENSIONS[ext])
}

type MenuKind = 'any' | 'image' | 'document' | 'pdf'

const ACCEPT: Record<MenuKind, string> = {
  any: '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.json,.csv,.docx,.xlsx,.zip,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,application/json,text/csv,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  image: '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif',
  document: '.txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv',
  pdf: '.pdf,application/pdf',
}

export function MessageComposer({
  onSend,
  isGenerating = false,
  onStop,
  placeholder = 'Message NYVEN',
  autoFocus = false,
  onVoiceToggle,
  voicePhase = 'idle',
  voiceEnergy = 0,
  onOpenVoiceChat,
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetDragY, setSheetDragY] = useState(0)
  const [isNarrow, setIsNarrow] = useState(false)
  const navigate = useNavigate()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const sheetDragStartY = useRef<number | null>(null)
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
      setSheetDragY(0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setSheetDragY(0)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Lock body scroll while mobile sheet is open
  useEffect(() => {
    if (!menuOpen || !isNarrow) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen, isNarrow])


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

      // Limit check outside the state updater (no network in setState)
      let blocked = false
      setAttachments((prev) => {
        if (prev.length >= ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE) {
          blocked = true
          return prev
        }
        return prev
      })
      if (blocked) {
        setComposerError(`You can attach up to ${ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE} files.`)
        return
      }

      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const kind = kindForMime(file.type || ALLOWED_EXTENSIONS[extensionOf(file.name)] || '')
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
      setAttachments((prev) => {
        if (prev.length >= ATTACHMENT_LIMITS.MAX_FILES_PER_MESSAGE) return prev
        return [...prev, pending]
      })

      try {
        const ext = extensionOf(file.name)
        // Client-side extract for zip/docx/xlsx/pdf/text before (or instead of) server
        if (
          ext === '.zip' ||
          ext === '.docx' ||
          ext === '.xlsx' ||
          ext === '.pdf' ||
          file.type === 'application/zip' ||
          file.type === 'application/x-zip-compressed' ||
          (file.type || '').includes('wordprocessingml') ||
          (file.type || '').includes('spreadsheetml')
        ) {
          updateAttachment(id, { status: 'processing' })
          try {
            const extracted = await extractAttachmentFile(file)
            updateAttachment(id, {
              status: 'ready',
              kind: 'document',
              mimeType: file.type || 'application/octet-stream',
              name: file.name,
              extractedText: extracted.text,
              file,
            })
            void cacheAttachmentBlob(id, file, {
              name: file.name,
              mime: file.type || 'application/octet-stream',
              userId: (window as any).__nyvenUserId || 'local',
            })
          } catch (ze: unknown) {
            updateAttachment(id, {
              status: 'error',
              error: ze instanceof Error ? ze.message : 'Could not read this file.',
            })
          }
          return
        }

        const toUpload = kind === 'image' ? await compressImage(file) : file
        updateAttachment(id, {
          status: 'processing',
          size: toUpload.size,
          mimeType: toUpload.type || file.type,
          name: toUpload.name || file.name,
        })
        const form = new FormData()
        form.append('file', toUpload)
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
            error: data.error || 'Could not process file.',
          })
          return
        }
        const att = data.attachment || data
        updateAttachment(id, {
          status: 'ready',
          extractedText: att.extractedText,
          inlineBase64: att.inlineBase64,
          mimeType: att.mimeType || toUpload.type,
          kind: (att.kind as PendingAttachment['kind']) || kind,
          file: toUpload,
        })
        void cacheAttachmentBlob(id, toUpload, {
          name: toUpload.name || file.name,
          mime: att.mimeType || toUpload.type,
          userId: (window as any).__nyvenUserId || 'local',
        })
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') {
          updateAttachment(id, { status: 'cancelled' })
          return
        }
        updateAttachment(id, {
          status: 'error',
          error: 'Upload failed. Tap to retry.',
        })
      }
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
    setSheetDragY(0)
    requestAnimationFrame(() => {
      if (fileInputRef.current) {
        fileInputRef.current.accept = ACCEPT[kind]
        fileInputRef.current.click()
      }
    })
  }

  const openCamera = () => {
    setMenuOpen(false)
    setSheetDragY(0)
    requestAnimationFrame(() => {
      cameraInputRef.current?.click()
    })
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setSheetDragY(0)
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
    // Mobile / coarse pointer: Enter inserts newline. Desktop: Enter sends.
    const isCoarse =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !isCoarse) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    const maxPx = 150
    requestAnimationFrame(() => {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`
    })
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
  const lineCount = Math.max(1, (value.match(/\n/g) || []).length + 1)
  const isExpanded = visibleAttachments.length > 0 || lineCount > 1 || value.length > 80

  const retryUpload = (a: PendingAttachment) => {
    if (!a.file) return
    removeAttachment(a.id)
    void uploadFile(a.file)
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-4 pb-3 sm:pb-4 min-w-0">
      {composerError && (
        <p className="text-xs text-red-300/90 mb-2 px-1" role="alert">
          {composerError}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
        }}
        className={clsx(
          'relative rounded-[24px] border bg-nyven-surface/95 backdrop-blur-sm transition-colors', isExpanded ? 'p-3' : 'px-2 py-1.5 sm:p-3',
          dragOver
            ? 'border-nyven-cyan/40 bg-nyven-cyan/[0.04]'
            : 'border-white/[0.08] focus-within:border-white/[0.14]'
        )}
      >
        {/* Row 1 — attachment tiles */}
        {visibleAttachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2 pb-1 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleAttachments.map((a) => {
              const ext = extensionOf(a.name).toUpperCase() || 'FILE'
              return (
                <div
                  key={a.id}
                  className={clsx(
                    'relative shrink-0 w-[104px] h-[104px] rounded-2xl overflow-hidden border bg-white/[0.04]',
                    a.status === 'error'
                      ? 'border-red-400/60'
                      : 'border-white/[0.08]'
                  )}
                >
                  {a.kind === 'image' && a.previewUrl ? (
                    <img
                      src={a.previewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1">
                      {a.name.toLowerCase().endsWith('.pdf') ? (
                        <FileText size={20} className="text-nyven-cyan/80" />
                      ) : a.kind === 'image' ? (
                        <ImageIcon size={20} className="text-nyven-text-secondary" />
                      ) : (
                        <File size={20} className="text-nyven-text-secondary" />
                      )}
                      <span className="text-[9px] text-nyven-text-secondary truncate max-w-full">
                        {ext}
                      </span>
                    </div>
                  )}
                  {(a.status === 'uploading' || a.status === 'processing') && (
                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                      <Loader2 size={22} className="animate-spin text-white" />
                    </div>
                  )}
                  {a.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => retryUpload(a)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center text-[10px] text-red-200 font-medium"
                      aria-label={`Retry ${a.name}`}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#0c1018] border border-white/20 text-nyven-text flex items-center justify-center shadow"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Hidden file input */}
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

        {/* Camera capture (mobile sheet) */}
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* Plus menu: mobile bottom sheet / desktop popover */}
        {menuOpen && isNarrow && (
          <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Add to chat">
            <button
              type="button"
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              aria-label="Close"
              onClick={closeMenu}
            />
            <div
              ref={menuRef}
              className="absolute left-0 right-0 bottom-0 max-h-[min(88vh,640px)] flex flex-col rounded-t-[28px] border-t border-white/10 bg-[#0C1018]/95 backdrop-blur-xl shadow-[0_-12px_40px_rgba(0,0,0,0.45)] pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{
                transform: `translateY(${sheetDragY}px)`,
                transition:
                  sheetDragStartY.current == null &&
                  !(typeof window !== 'undefined' &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches)
                    ? 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)'
                    : undefined,
                backgroundImage:
                  'linear-gradient(180deg, rgba(98,230,255,0.08) 0%, rgba(139,124,255,0.04) 28px, transparent 72px)',
              }}
              onTouchStart={(e) => {
                sheetDragStartY.current = e.touches[0].clientY
              }}
              onTouchMove={(e) => {
                if (sheetDragStartY.current == null) return
                const dy = e.touches[0].clientY - sheetDragStartY.current
                if (dy > 0) setSheetDragY(dy)
              }}
              onTouchEnd={() => {
                if (sheetDragY > 90) closeMenu()
                else setSheetDragY(0)
                sheetDragStartY.current = null
              }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="relative flex items-center justify-center px-4 pb-3">
                <button
                  type="button"
                  onClick={closeMenu}
                  className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center text-nyven-text-secondary hover:bg-white/[0.06] active:bg-nyven-cyan/10"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
                <h2 className="font-display text-base font-medium text-nyven-text">Add to chat</h2>
              </div>

              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {[
                  { label: 'Camera', icon: Camera, action: openCamera },
                  { label: 'Photos', icon: ImageIcon, action: () => openPicker('image') },
                  { label: 'Files', icon: File, action: () => openPicker('any') },
                ].map((tile) => (
                  <button
                    key={tile.label}
                    type="button"
                    onClick={tile.action}
                    className="h-24 rounded-2xl border border-white/[0.08] bg-white/[0.03] flex flex-col items-center justify-center gap-2 active:bg-nyven-cyan/10 transition-colors"
                  >
                    <span className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center text-nyven-cyan">
                      <tile.icon size={22} />
                    </span>
                    <span className="text-sm text-nyven-text">{tile.label}</span>
                  </button>
                ))}
              </div>

              <div className="px-3 pb-2 space-y-0.5">
                {[
                  {
                    label: 'Projects',
                    hint: 'Your AI workspaces',
                    icon: FolderOpen,
                    onClick: () => {
                      closeMenu()
                      navigate('/projects')
                    },
                  },
                ].map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    onClick={row.onClick}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left min-h-[56px] active:bg-nyven-cyan/10 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-nyven-text-secondary shrink-0">
                      <row.icon size={22} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] text-nyven-text">{row.label}</span>
                      <span className="block text-xs text-nyven-text-secondary truncate">{row.hint}</span>
                    </span>
                    <ChevronRight size={22} className="text-nyven-text-secondary/50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {menuOpen && !isNarrow && (
          <div
            ref={menuRef}
            className="absolute left-3 bottom-full mb-2 z-30 w-56 origin-bottom-left rounded-xl border border-white/[0.1] bg-[#0c1018]/95 backdrop-blur-md shadow-xl shadow-black/40 p-1.5"
            role="menu"
            aria-label="Add to chat"
          >
            {(
              [
                { kind: 'image' as MenuKind, label: 'Upload image', icon: ImageIcon },
                { kind: 'any' as MenuKind, label: 'Upload file', icon: File },
                { kind: 'document' as MenuKind, label: 'Document', icon: FileText },
                { kind: 'pdf' as MenuKind, label: 'PDF', icon: FileText },
              ] as const
            ).map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                onClick={() => openPicker(item.kind)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-nyven-text hover:bg-white/[0.06] transition-colors text-left min-h-[44px]"
              >
                <item.icon size={16} className="text-nyven-text-secondary shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Row 2 — full-width textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          className="w-full min-w-0 bg-transparent border-0 outline-none resize-none text-base leading-[1.65] text-nyven-text placeholder:text-nyven-text-secondary/70 max-h-[150px] overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin] touch-pan-y"
          style={{ minHeight: '48px' }}
        />

        {/* Row 3 — controls */}
        <div className="flex items-center gap-1 mt-1">
          <button
            ref={plusRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={clsx(
              'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors',
              menuOpen
                ? 'bg-nyven-cyan/15 text-nyven-cyan'
                : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.06]'
            )}
            aria-label="Add to chat"
            aria-expanded={menuOpen}
          >
            <Plus size={20} />
          </button>

          <div className="flex-1 min-w-0" />

          <div className="flex items-center gap-0.5 shrink-0">
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
                disabled={!onVoiceToggle}
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                  voicePhase === 'speaking' && 'text-nyven-cyan bg-nyven-cyan/10',
                  voicePhase === 'transcribing' && 'text-nyven-text-secondary',
                  (voicePhase === 'idle' ||
                    voicePhase === 'error' ||
                    voicePhase === 'requesting_permission') &&
                    'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]',
                  !onVoiceToggle && 'opacity-40 cursor-not-allowed'
                )}
                aria-label={
                  voicePhase === 'speaking'
                    ? 'Stop speaking'
                    : voicePhase === 'transcribing'
                      ? 'Transcribing'
                      : 'Dictate'
                }
              >
                {voicePhase === 'transcribing' ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <Mic size={22} />
                )}
              </button>
            )}

            {onOpenVoiceChat && (
              <button
                type="button"
                onClick={onOpenVoiceChat}
                disabled={isGenerating}
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] transition-colors',
                  isGenerating && 'opacity-40 cursor-not-allowed'
                )}
                aria-label="Voice chat"
                title="Voice chat"
              >
                <AudioLines size={22} />
              </button>
            )}

            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.08] text-nyven-text hover:bg-white/[0.12] transition-colors"
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
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                  canSend
                    ? 'bg-nyven-cyan text-nyven-bg hover:bg-nyven-cyan/90'
                    : 'bg-white/[0.06] text-nyven-text-secondary opacity-50 cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <Send size={22} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

