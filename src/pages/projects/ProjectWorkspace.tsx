import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  MessageSquare,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
  Check,
  Image as ImageIcon,
  File,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../lib/auth/AuthContext'
import {
  activityLabel,
  createProjectChat,
  deleteProject,
  fetchProject,
  formatRelative,
  saveTask,
  updateProject,
  type AiProject,
  type ProjectActivity,
  type ProjectChat,
  type ProjectTask,
} from '../../lib/aiProjects/api'
import { MessageComposer, type ComposerSendPayload } from '../../components/MessageComposer'
import { ChatThread } from '../../components/chat/ChatThread'
import { JumpToLatestButton } from '../../components/chat/JumpToLatestButton'
import { ReadAloudPlayer } from '../../components/chat/ReadAloudPlayer'
import { useReadAloud } from '../../hooks/useReadAloud'
import { streamCoreChat } from '../../lib/core/streamClient'
import type { Message } from '../../lib/types'
import type { ActivityState } from '../../lib/core/types'
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen'
import { useChatScroll } from '../../hooks/useChatScroll'
import { useHideOnScroll } from '../../hooks/useHideOnScroll'
import { extractAttachmentFile } from '../../lib/attachments/extract'
import { cacheAttachmentBlob } from '../../lib/attachments/fileCache'
import { useComposerVoice } from '../../hooks/useComposerVoice'
import { VoiceChatScreen } from '../../components/voice/VoiceChatScreen'
import { extractMemoriesFromExchange } from '../../lib/memoryStore'
import { AttachmentCard } from '../../components/attachments/AttachmentCard'
import { AttachmentViewer } from '../../components/attachments/AttachmentViewer'

type Tab = 'chat' | 'files' | 'details'

type ProjectFileRow = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: string
  createdAt: string
  stored?: boolean
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'details', label: 'Details', icon: MoreHorizontal },
]

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectWorkspace() {
  const { projectId = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const keyboardOpen = useKeyboardOpen()
  const tab = ((search.get('tab') as Tab) || 'chat') as Tab
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(search)
    next.set('tab', t)
    setSearch(next, { replace: true })
  }

  const [project, setProject] = useState<AiProject | null>(null)
  const [thread, setThread] = useState<ProjectChat | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [activity, setActivity] = useState<ProjectActivity[]>([])
  const [files, setFiles] = useState<ProjectFileRow[]>([])
  const [durableStorage, setDurableStorage] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [instrDraft, setInstrDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [fileSheetOpen, setFileSheetOpen] = useState(false)
  const [busyKind, setBusyKind] = useState<'photos' | 'files' | 'zip' | null>(null)
  const [viewerItem, setViewerItem] = useState<import('../../components/attachments/AttachmentCard').AttachmentCardData | null>(null)

  const [activityOpen, setActivityOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const acceptRef = useRef('image/*,.pdf,.txt,.md,.json,.csv,.docx,.xlsx,.zip')

  const voice = useComposerVoice({ isGenerating })
  const chatScroll = useChatScroll()
  const hideHeader = useHideOnScroll(24)
  const readAloud = useReadAloud()
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)


  const reload = useCallback(async () => {
    if (!projectId || !user?.id || projectId === 'new') return
    setLoading(true)
    setError(null)
    const data = await fetchProject(projectId)
    if (!data) {
      setError('Project not found or access denied.')
      setProject(null)
      setLoading(false)
      return
    }
    setProject(data.project)
    setTasks(data.tasks)
    setActivity(data.activity)
    setInstrDraft(data.project.instructions || '')
    setDescDraft(data.project.description || '')
    setNameDraft(data.project.name || data.project.title)

    // One continuous thread: newest chat, or create with project name
    const sorted = [...(data.chats || [])].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    let main = sorted[0] || null
    if (!main) {
      const created = await createProjectChat(projectId, data.project.name || data.project.title)
      if (created.chat) main = created.chat
      else setActionError(created.error || null)
    }
    setThread(main)
    setLoading(false)
  }, [projectId, user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  // Load messages for the single thread
  useEffect(() => {
    if (!thread?.id || !user?.id) {
      setMessages([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${thread.id}`, { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: any) => {
              let attachments = m.attachments
              if (!attachments && m.metadata) {
                try {
                  const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata
                  attachments = meta?.attachments
                } catch { /* */ }
              }
              return {
                id: m.id,
                role: m.role === 'assistant' ? 'nyven' : m.role === 'user' ? 'user' : 'nyven',
                content: m.content || '',
                timestamp: m.timestamp || m.created_at || Date.now(),
                attachments: Array.isArray(attachments)
                  ? attachments.map((a: any) => ({
                      id: a.id || crypto.randomUUID(),
                      name: a.name || 'File',
                      mimeType: a.mimeType || a.mime_type || 'application/octet-stream',
                      size: a.size || 0,
                      kind: a.kind || 'document',
                      previewDataUrl: a.previewDataUrl || a.previewUrl,
                    }))
                  : undefined,
              }
            })
          )
        }
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [thread?.id, user?.id])

  const loadFiles = useCallback(async () => {
    if (!projectId || !user?.id) return
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.files)) {
        setFiles(data.files)
        setDurableStorage(data.durableStorage !== false)
      }
    } catch {
      /* */
    }
  }, [projectId, user?.id])

  useEffect(() => {
    if (tab === 'files') void loadFiles()
  }, [tab, loadFiles])

  // Only stick to bottom when user is already near bottom (scrollToBottom no-ops otherwise)
  useEffect(() => {
    chatScroll.scrollToBottom(false, false)
  }, [messages.length, chatScroll.scrollToBottom])

  const handleSend = useCallback(
    async (payload: ComposerSendPayload, opts?: { fromVoice?: boolean }) => {
      if (!projectId || !thread?.id || isGenerating) return
      const text = typeof payload === 'string' ? payload : (payload.text || '').trim()
      const attachments = typeof payload === 'string' ? [] : payload.attachments || []
      if (!text && !attachments.length) return

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text || 'Attachment',
        timestamp: Date.now(),
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
          kind: a.kind,
          previewDataUrl: a.previewUrl || (a.inlineBase64 && a.mimeType?.startsWith('image/')
            ? `data:${a.mimeType};base64,${a.inlineBase64}`
            : undefined),
        })),
      }
      const streamId = crypto.randomUUID()
      const streamMsg: Message = {
        id: streamId,
        role: 'nyven',
        content: '',
        timestamp: Date.now(),
        isThinking: true,
        isStreaming: true,
        activityState: 'thinking',
      }
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'nyven')
        .map((m) => ({
          role: (m.role === 'nyven' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        }))

      setMessages((prev) => [...prev, userMsg, streamMsg])
      setIsGenerating(true)
      const controller = new AbortController()
      abortRef.current = controller

      const title = project?.name || project?.title || 'Project'
      // Save chat attachments into project Files (best-effort)
      for (const a of attachments) {
        if (!a.file && !a.extractedText) continue
        try {
          const form = new FormData()
          if (a.file) {
            form.append('file', a.file, a.name)
          } else if (a.extractedText) {
            form.append(
              'file',
              new File([a.extractedText], a.name.endsWith('.txt') ? a.name : `${a.name}.txt`, {
                type: 'text/plain',
              })
            )
          }
          await fetch(`/api/projects/${projectId}/files`, {
            method: 'POST',
            credentials: 'include',
            body: form,
          })
        } catch {
          /* */
        }
      }

      try {
        await fetch(`/api/conversations/${thread.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, title }),
        })
        await fetch(`/api/conversations/${thread.id}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            messages: [
              {
                id: userMsg.id,
                role: 'user',
                content: userMsg.content,
                createdAt: userMsg.timestamp,
                metadata: { attachments: userMsg.attachments || [] },
              },
            ],
          }),
        })
      } catch {
        /* */
      }

      let full = ''
      try {
        await streamCoreChat(
          {
            message: text || 'Please analyze the attached content.',
            history,
            attachments: attachments as any,
            signal: controller.signal,
            metadata: {
              projectId,
              conversationId: thread.id,
            },
          },
          {
            onActivity: (state: ActivityState, detail?: string) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        activityState: state,
                        activityDetail: detail,
                        isThinking: state === 'thinking' && !m.content,
                        isStreaming: state === 'generating' || state === 'thinking',
                      }
                    : m
                )
              )
            },
            onToken: (tokenText: string) => {
              full += tokenText
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        content: full,
                        isThinking: false,
                        isStreaming: true,
                        activityState: 'generating',
                      }
                    : m
                )
              )
            },
            onDone: () => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? { ...m, isStreaming: false, isThinking: false, activityState: undefined }
                    : m
                )
              )
              void fetch(`/api/conversations/${thread.id}/messages`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title,
                  messages: [
                    { id: streamId, role: 'assistant', content: full, createdAt: Date.now() },
                  ],
                }),
              })
              if (opts?.fromVoice || voice.fromVoiceRef.current) {
                void voice.speakReply(full)
              } else {
                voice.markVoiceSubmitDone()
              }
              void extractMemoriesFromExchange(user?.id ?? null, text, full, {
                projectId,
                conversationId: thread.id,
              })
            },
            onError: (_code, message) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        content: message || 'Something went wrong.',
                        isStreaming: false,
                        isThinking: false,
                      }
                    : m
                )
              )
              voice.markVoiceSubmitDone()
            },
          }
        )
      } finally {
        setIsGenerating(false)
        abortRef.current = null
      }
    },
    [projectId, thread?.id, isGenerating, messages, project, user?.id, voice]
  )

  useEffect(() => {
    voice.setSendHandler((payload, opts) => handleSend(payload as ComposerSendPayload, opts))
  }, [handleSend, voice])

  const saveDetails = async (fields: { name?: string; description?: string; instructions?: string }) => {
    if (!projectId) return
    setSaving(true)
    const updated = await updateProject(projectId, fields)
    if (updated) setProject(updated)
    setSaving(false)
  }

  const handleDelete = async () => {
    if (deleteConfirm !== 'DELETE' || !projectId) return
    const ok = await deleteProject(projectId)
    if (ok) navigate('/projects', { replace: true })
  }

  const addTask = async () => {
    const title = newTaskTitle.trim()
    if (!title || !projectId) return
    const task = await saveTask(projectId, { title, status: 'todo' })
    if (task) {
      setTasks((prev) => [task, ...prev])
      setNewTaskTitle('')
    }
  }

  const toggleTaskDone = async (task: ProjectTask) => {
    if (!projectId) return
    const next = task.status === 'done' ? 'todo' : 'done'
    const updated = await saveTask(projectId, {
      id: task.id,
      title: task.title,
      description: task.description,
      status: next,
      priority: task.priority,
    })
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    }
  }

  const uploadProjectFile = async (file: File, kind: 'photos' | 'files' | 'zip') => {
    if (!projectId) return
    setBusyKind(kind)
    setActionError(null)
    try {
      let uploadFile = file
      // Downscale images for storage + vision
      if ((file.type || '').startsWith('image/')) {
        try {
          const bmp = await createImageBitmap(file)
          const max = 1024
          const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
          const w = Math.round(bmp.width * scale)
          const h = Math.round(bmp.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(bmp, 0, 0, w, h)
            const blob: Blob | null = await new Promise((res) =>
              canvas.toBlob((b) => res(b), 'image/jpeg', 0.85)
            )
            if (blob) {
              uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
              })
            }
          }
        } catch { /* keep original */ }
      }
      const form = new FormData()
      form.append('file', uploadFile)
      try {
        const extracted = await extractAttachmentFile(file)
        if (extracted.text) form.append('extractedText', extracted.text)
        // Image: mark for description; scanned PDF page images not uploaded as binary here
        if ((file.type || '').startsWith('image/') && !extracted.text) {
          form.append(
            'extractedText',
            '[Image attached — describe visible content and any text when answering.]'
          )
        }
        if (extracted.meta?.status) {
          form.append('status', extracted.meta.status)
        }
      } catch { /* */ }
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setActionError(data.error || 'Could not upload file. Please try again.')
      } else {
        if (data.note) setDurableStorage(false)
        setFileSheetOpen(false)
        if (data.file?.id) {
          void cacheAttachmentBlob(data.file.id, file, {
            name: file.name,
            mime: file.type || 'application/octet-stream',
            userId: user?.id || 'local',
          })
        }
        await loadFiles()
      }
    } catch {
      setActionError('Could not upload file. Please try again.')
    } finally {
      setBusyKind(null)
    }
  }

  const deleteFile = async (fileId: string) => {
    if (!projectId) return
    await fetch(`/api/projects/${projectId}/files?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  if (projectId === 'new') {
    navigate('/projects/new', { replace: true })
    return null
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-sm text-nyven-text-secondary">
        Sign in to open this project.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-nyven-text-secondary">
        Loading project…
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-nyven-text-secondary">{error || 'Project not found'}</p>
        <Link to="/projects" className="text-sm text-nyven-cyan">
          Back to Projects
        </Link>
      </div>
    )
  }

  const projectTitle = project.name || project.title

  return (
    <div className="h-full flex flex-col min-h-0 bg-nyven-bg">
      {/* Mobile-first header — no global hamburger row on this page (App hides MobileNavBar) */}
      <header className={clsx("shrink-0 h-[52px] px-2 sm:px-3 flex items-center gap-1 transition-transform duration-200 bg-nyven-bg", hideHeader.hidden && tab === "chat" && "-translate-y-full opacity-0 pointer-events-none")}>
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="w-11 h-11 rounded-xl grid place-items-center text-nyven-text-secondary hover:bg-white/[0.05]"
          aria-label="Back to projects"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 min-w-0 font-medium text-[15px] truncate px-1">{projectTitle}</h1>
        <button
          type="button"
          onClick={() => setTab('details')}
          className="w-11 h-11 rounded-xl grid place-items-center text-nyven-text-secondary hover:bg-white/[0.05]"
          aria-label="Project details"
        >
          <MoreHorizontal size={20} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col relative">
            <ChatThread
              messages={messages}
              isGenerating={isGenerating}
              conversationId={thread?.id || undefined}
              scrollRef={chatScroll.scrollRef}
              bottomRef={chatScroll.bottomRef}
              onScroll={(e) => {
                chatScroll.onChatScroll(e)
                hideHeader.onScroll(e)
              }}
              emptyState={
                <div className="py-12 text-center">
                  <h2 className="font-display text-xl font-medium mb-2">{projectTitle}</h2>
                  <p className="text-sm text-nyven-text-secondary leading-relaxed max-w-md mx-auto mb-2">
                    {project.description || 'Ask anything about this project'}
                  </p>
                  <p className="text-xs text-nyven-text-secondary/80">Ask anything about this project</p>
                </div>
              }
              onFeedback={(messageId, rating) => {
                void fetch('/api/feedback', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    messageId,
                    rating,
                    conversationId: thread?.id,
                  }),
                })
                  .then((r) => {
                    if (r.ok) {
                      setFeedbackToast('Thanks for your feedback')
                      setTimeout(() => setFeedbackToast(null), 2500)
                    }
                  })
                  .catch(() => {})
              }}
              onReadAloud={(id, content) => readAloud.play(id, content)}
              onStopReadAloud={readAloud.stop}
              readingMessageId={readAloud.state.messageId}
              readAloudLoading={readAloud.state.loading}
              onAttachmentClick={(a) =>
                setViewerItem({
                  id: a.id,
                  name: a.name || 'File',
                  mimeType: a.mimeType,
                  size: a.size,
                  kind: a.kind,
                  previewUrl: a.previewDataUrl,
                })
              }
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
            />
            <JumpToLatestButton
              visible={chatScroll.showJumpLatest}
              onClick={() => chatScroll.scrollToBottom(true, true)}
            />
            {feedbackToast && (
              <p className="px-4 text-xs text-nyven-cyan text-center pb-1">{feedbackToast}</p>
            )}
            {actionError && (
              <p className="px-4 text-xs text-red-300/90 text-center pb-1">{actionError}</p>
            )}
            <div className="shrink-0 p-2 sm:p-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] relative">
              <ReadAloudPlayer
                state={readAloud.state}
                onTogglePause={readAloud.togglePause}
                onSeek={readAloud.seek}
                onCycleRate={readAloud.cycleRate}
                onClose={readAloud.stop}
              />
              <div className="max-w-3xl mx-auto">
                <MessageComposer
                  onSend={(p) => void handleSend(p)}
                  isGenerating={isGenerating}
                  onStop={() => abortRef.current?.abort()}
                  placeholder="Message this project…"
                  onVoiceToggle={voice.onVoiceToggle}
                  voicePhase={voice.voicePhase}
                  voiceEnergy={voice.voiceEnergy}
                  onOpenVoiceChat={voice.openVoiceChat}
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">
                  Files <span className="text-nyven-text-secondary font-normal">({files.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setFileSheetOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
              {!durableStorage && (
                <p className="text-xs text-nyven-text-secondary mb-3 leading-relaxed">
                  Text from files is saved with the project. Original images may not be kept until durable
                  storage is configured.
                </p>
              )}
              {actionError && <p className="text-xs text-red-300/90 mb-3">{actionError}</p>}
              {files.length === 0 ? (
                <div className="py-16 text-center text-sm text-nyven-text-secondary">
                  No files yet. Add photos, documents, or a zip.
                </div>
              ) : (
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {files.map((f) => (
                    <li key={f.id} className="relative">
                      <AttachmentCard
                        item={{
                          id: f.id,
                          name: f.name,
                          mimeType: f.mimeType,
                          size: f.size,
                          kind: f.kind,
                        }}
                        onClick={() =>
                          setViewerItem({
                            id: f.id,
                            name: f.name,
                            mimeType: f.mimeType,
                            size: f.size,
                            kind: f.kind,
                          })
                        }
                        className="w-full h-[120px]"
                      />
                      <button
                        type="button"
                        onClick={() => void deleteFile(f.id)}
                        className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/50 grid place-items-center text-white/80"
                        aria-label={`Delete ${f.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'details' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <div className="max-w-3xl mx-auto space-y-4">
              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-nyven-text-secondary mb-2">Name</h3>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value.slice(0, 120))}
                  onBlur={() => {
                    if (nameDraft.trim() && nameDraft !== projectTitle) {
                      void saveDetails({ name: nameDraft.trim() })
                    }
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35"
                />
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-nyven-text-secondary mb-2">
                  Description
                </h3>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value.slice(0, 2000))}
                  onBlur={() => void saveDetails({ description: descDraft })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35 resize-y"
                />
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-nyven-text-secondary mb-2">
                  Instructions
                </h3>
                <textarea
                  value={instrDraft}
                  onChange={(e) => setInstrDraft(e.target.value.slice(0, 8000))}
                  rows={5}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35 resize-y min-h-[120px]"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveDetails({ instructions: instrDraft })}
                  className="mt-2 px-4 h-10 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-nyven-text-secondary mb-2">Tasks</h3>
                <div className="flex gap-2 mb-2">
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="New task"
                    className="flex-1 h-10 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void addTask()}
                    className="px-3 h-10 rounded-xl border border-white/[0.1] text-sm"
                  >
                    Add
                  </button>
                </div>
                <ul className="space-y-1">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm py-1.5">
                      <button type="button" onClick={() => void toggleTaskDone(t)} className="shrink-0">
                        {t.status === 'done' ? (
                          <Check size={16} className="text-nyven-cyan" />
                        ) : (
                          <span className="w-4 h-4 rounded border border-white/25 block" />
                        )}
                      </button>
                      <span className={clsx(t.status === 'done' && 'line-through opacity-60')}>
                        {t.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <button
                  type="button"
                  onClick={() => setActivityOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-nyven-text-secondary"
                >
                  Recent activity
                  <span className="text-[10px]">{activityOpen ? 'Hide' : 'Show'}</span>
                </button>
                {activityOpen && (
                  <ul className="mt-3 space-y-2">
                    {activity.length === 0 ? (
                      <li className="text-sm text-nyven-text-secondary">No activity yet.</li>
                    ) : (
                      activity.map((a) => (
                        <li key={a.id} className="flex justify-between gap-2 text-sm">
                          <span>{activityLabel(a.eventType)}</span>
                          <span className="text-[11px] text-nyven-text-secondary shrink-0">
                            {a.createdAt ? formatRelative(a.createdAt) : ''}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-red-400/20 p-4">
                <h3 className="font-medium text-red-300/90 mb-2">Danger zone</h3>
                <p className="text-xs text-nyven-text-secondary mb-2">
                  Permanently delete this project. Type DELETE to confirm.
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm mb-2 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-1.5 text-sm text-red-400/90 min-h-[40px]"
                >
                  <Trash2 size={14} /> Delete project
                </button>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Bottom tabs — hide when keyboard is open */}
      {!keyboardOpen && (
        <nav className="shrink-0 flex pb-[env(safe-area-inset-bottom)] sm:pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] min-h-[52px]',
                tab === id ? 'text-nyven-cyan' : 'text-nyven-text-secondary'
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Add file sheet */}
      {fileSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setFileSheetOpen(false)}
          />
          <div className="relative rounded-t-2xl bg-[#0c1018] border-t border-white/[0.1] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-sm">Add to project</h3>
              <button type="button" onClick={() => setFileSheetOpen(false)} className="p-2">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'photos' as const, label: 'Photos', accept: 'image/*' },
                  { key: 'files' as const, label: 'Files', accept: '.pdf,.txt,.md,.json,.csv,.docx,.xlsx' },
                  { key: 'zip' as const, label: 'Zip', accept: '.zip,application/zip' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  disabled={busyKind !== null}
                  onClick={() => {
                    acceptRef.current = opt.accept
                    ;(fileInputRef.current as any).__kind = opt.key
                    requestAnimationFrame(() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = opt.accept
                        fileInputRef.current.click()
                      }
                    })
                  }}
                  className="h-24 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm disabled:opacity-50"
                >
                  {busyKind === opt.key ? '…' : opt.label}
                </button>
              ))}
            </div>
            {actionError && <p className="text-xs text-red-300/90 mt-3 text-center">{actionError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                const kind = ((e.target as any).__kind || 'files') as 'photos' | 'files' | 'zip'
                e.target.value = ''
                if (f) void uploadProjectFile(f, kind)
              }}
            />
          </div>
        </div>
      )}

      <AttachmentViewer
        open={!!viewerItem}
        item={viewerItem}
        onClose={() => setViewerItem(null)}
        userId={user?.id}
        onSaveText={(text) => {
          if (!viewerItem?.id || !projectId) return
          void fetch(`/api/projects/${projectId}/files/${viewerItem.id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extractedText: text }),
          }).then((r) => {
            if (r.ok) void loadFiles()
          })
        }}
      />

      <VoiceChatScreen
        open={voice.voiceChatOpen}
        onClose={voice.closeVoiceChat}
        voicePhase={voice.voicePhase}
        isProcessing={isGenerating || voice.voicePhase === 'transcribing'}
        isSpeaking={voice.voicePhase === 'speaking'}
        energy={voice.voiceEnergy}
        muted={voice.voiceMuted}
        onToggleMute={() => voice.toggleMute()}
        onToggleListen={voice.onVoiceToggle}
        lastTranscript={voice.lastVoiceTranscript}
        lastReply={voice.lastVoiceReply}
      />
    </div>
  )
}
