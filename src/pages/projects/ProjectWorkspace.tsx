import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  MessageSquare,
  LayoutDashboard,
  FileText,
  ListTodo,
  Activity as ActivityIcon,
  Settings,
  Plus,
  Trash2,
  Check,
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
import { ChatMessage } from '../../components/ChatMessage'
import { streamCoreChat } from '../../lib/core/streamClient'
import type { Message } from '../../lib/types'
import type { ActivityState } from '../../lib/core/types'

type Tab = 'overview' | 'chat' | 'files' | 'instructions' | 'activity' | 'settings'

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; mobile?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, mobile: true },
  { id: 'chat', label: 'Chat', icon: MessageSquare, mobile: true },
  { id: 'files', label: 'Files', icon: FileText, mobile: true },
  { id: 'instructions', label: 'Instructions', icon: FileText },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
  { id: 'settings', label: 'Settings', icon: Settings, mobile: true },
]

export function ProjectWorkspace() {
  const { projectId = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const tab = (search.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(search)
    next.set('tab', t)
    setSearch(next, { replace: true })
  }

  const [project, setProject] = useState<AiProject | null>(null)
  const [chats, setChats] = useState<ProjectChat[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [activity, setActivity] = useState<ProjectActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(search.get('c'))
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [instrDraft, setInstrDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const reload = useCallback(async () => {
    if (!projectId || !user?.id) return
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
    setChats(data.chats)
    setTasks(data.tasks)
    setActivity(data.activity)
    setInstrDraft(data.project.instructions || '')
    setNameDraft(data.project.name || data.project.title)
    setDescDraft(data.project.description || '')
    setLoading(false)
  }, [projectId, user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!activeChatId || !user?.id) {
      setMessages([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeChatId}`, { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: any) => ({
              id: m.id,
              role: m.role === 'assistant' ? 'nyven' : m.role,
              content: m.content,
              timestamp: m.timestamp || Date.now(),
            }))
          )
        }
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeChatId, user?.id])

  const openChat = (id: string) => {
    setActiveChatId(id)
    const next = new URLSearchParams(search)
    next.set('tab', 'chat')
    next.set('c', id)
    setSearch(next, { replace: true })
  }

  const handleNewChat = async () => {
    if (!projectId) return
    const chat = await createProjectChat(projectId)
    if (chat) {
      setChats((prev) => [chat, ...prev])
      openChat(chat.id)
    }
  }

  const handleSend = async (payload: ComposerSendPayload) => {
    if (!projectId || !activeChatId || isGenerating) return
    const text = (payload.text || '').trim()
    if (!text && !(payload.attachments?.length)) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text || 'Attachment',
      timestamp: Date.now(),
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

    // Persist user message + ensure conversation linked to project
    try {
      await fetch(`/api/conversations/${activeChatId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      await fetch(`/api/conversations/${activeChatId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: text.slice(0, 40) || 'Chat',
          messages: [{ id: userMsg.id, role: 'user', content: userMsg.content, createdAt: userMsg.timestamp }],
        }),
      })
    } catch { /* */ }

    let full = ''
    try {
      await streamCoreChat(
        {
          message: text || 'Please analyze the attached content.',
          history,
          signal: controller.signal,
          metadata: { projectId, conversationId: activeChatId },
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
                  ? { ...m, content: full, isThinking: false, isStreaming: true, activityState: 'generating' }
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
            void fetch(`/api/conversations/${activeChatId}/messages`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ id: streamId, role: 'assistant', content: full, createdAt: Date.now() }],
              }),
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
          },
        }
      )
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const saveInstructions = async () => {
    if (!projectId) return
    setSaving(true)
    const updated = await updateProject(projectId, { instructions: instrDraft })
    if (updated) setProject(updated)
    setSaving(false)
  }

  const saveGeneral = async () => {
    if (!projectId) return
    setSaving(true)
    const updated = await updateProject(projectId, {
      name: nameDraft,
      description: descDraft,
    })
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

  const mobileTabs = TABS.filter((t) => t.mobile)

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.07] px-3 sm:px-5 py-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="p-2 rounded-lg text-nyven-text-secondary hover:bg-white/[0.05] min-h-[40px] min-w-[40px] grid place-items-center"
            aria-label="Back to projects"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-medium text-[15px] truncate">{project.name || project.title}</h1>
            <p className="text-[11px] text-nyven-text-secondary truncate">
              Updated {formatRelative(project.updatedAt)}
            </p>
          </div>
        </div>
        {/* Desktop tabs */}
        <nav className="hidden sm:flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-colors',
                tab === id
                  ? 'bg-white/[0.08] text-nyven-text'
                  : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.04]'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'overview' && (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-nyven-text-secondary mb-2">
                About
              </h2>
              <p className="text-sm text-nyven-text leading-relaxed">
                {project.description || 'No description yet.'}
              </p>
              <p className="text-xs text-nyven-text-secondary mt-2">Status: {project.status}</p>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-nyven-text-secondary">
                  Recent chats
                </h2>
                <button
                  type="button"
                  onClick={() => void handleNewChat()}
                  className="text-xs text-nyven-cyan inline-flex items-center gap-1 min-h-[36px]"
                >
                  <Plus size={14} /> New chat
                </button>
              </div>
              {chats.length === 0 ? (
                <p className="text-sm text-nyven-text-secondary">No chats yet.</p>
              ) : (
                <ul className="space-y-1">
                  {chats.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openChat(c.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.04] text-sm text-nyven-text min-h-[44px]"
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-nyven-text-secondary mb-2">
                Tasks
              </h2>
              {tasks.length === 0 ? (
                <p className="text-sm text-nyven-text-secondary">No tasks yet.</p>
              ) : (
                <ul className="space-y-1">
                  {tasks.slice(0, 8).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-2 text-sm text-nyven-text"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleTaskDone(t)}
                        className={clsx(
                          'w-5 h-5 rounded border grid place-items-center shrink-0',
                          t.status === 'done'
                            ? 'bg-nyven-cyan/20 border-nyven-cyan/40 text-nyven-cyan'
                            : 'border-white/20'
                        )}
                        aria-label={t.status === 'done' ? 'Mark todo' : 'Mark done'}
                      >
                        {t.status === 'done' && <Check size={12} />}
                      </button>
                      <span className={clsx(t.status === 'done' && 'line-through opacity-60')}>
                        {t.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-nyven-text-secondary mb-2">
                Recent activity
              </h2>
              {activity.length === 0 ? (
                <p className="text-sm text-nyven-text-secondary">No activity yet.</p>
              ) : (
                <ul className="space-y-2">
                  {activity.slice(0, 8).map((a) => (
                    <li key={a.id} className="text-sm text-nyven-text-secondary">
                      <span className="text-nyven-text">{activityLabel(a.eventType)}</span>
                      <span className="ml-2 text-[11px]">{formatRelative(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button
              type="button"
              onClick={() => {
                setTab('chat')
                if (!activeChatId && chats[0]) openChat(chats[0].id)
                else if (!activeChatId) void handleNewChat()
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium min-h-[44px]"
            >
              Continue working
            </button>
          </div>
        )}

        {tab === 'chat' && (
          <div className="h-full flex min-h-0 flex-col sm:flex-row">
            <aside className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-white/[0.07] max-h-40 sm:max-h-none overflow-y-auto">
              <div className="p-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-nyven-text-secondary px-2">
                  Chats
                </span>
                <button
                  type="button"
                  onClick={() => void handleNewChat()}
                  className="p-2 rounded-lg text-nyven-cyan hover:bg-white/[0.05]"
                  aria-label="New project chat"
                >
                  <Plus size={16} />
                </button>
              </div>
              <ul className="px-1 pb-2 space-y-0.5">
                {chats.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded-xl text-sm truncate min-h-[40px]',
                        activeChatId === c.id
                          ? 'bg-white/[0.08] text-nyven-text'
                          : 'text-nyven-text-secondary hover:bg-white/[0.04]'
                      )}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
                {chats.length === 0 && (
                  <li className="px-3 py-4 text-xs text-nyven-text-secondary">
                    No chats yet. Start one.
                  </li>
                )}
              </ul>
            </aside>
            <div className="flex-1 min-h-0 flex flex-col">
              {!activeChatId ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <button
                    type="button"
                    onClick={() => void handleNewChat()}
                    className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium min-h-[44px]"
                  >
                    Start project chat
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
                    {messages.map((m) => (
                      <ChatMessage key={m.id} message={m} />
                    ))}
                  </div>
                  <div className="shrink-0 border-t border-white/[0.07] p-2 sm:p-3">
                    <MessageComposer
                      onSend={(p) => void handleSend(p)}
                      isGenerating={isGenerating}
                      onStop={() => abortRef.current?.abort()}
                      placeholder="Message NYVEN in this project…"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="max-w-2xl mx-auto px-4 py-8">
            <h2 className="font-medium mb-2">Files</h2>
            <p className="text-sm text-nyven-text-secondary leading-relaxed mb-4">
              Project file storage is designed to use NYVEN’s existing attachment system. Full
              project-level library UI ships with the next resources pass. You can still attach
              files in Project Chat today.
            </p>
            <p className="text-xs text-nyven-text-secondary">
              Files associated with this project: {project.fileCount ?? 0}
            </p>
          </div>
        )}

        {tab === 'instructions' && (
          <div className="max-w-2xl mx-auto px-4 py-6">
            <h2 className="font-medium mb-1">Project instructions</h2>
            <p className="text-sm text-nyven-text-secondary mb-4 leading-relaxed">
              These instructions are included in AI context for every chat inside this project.
            </p>
            <textarea
              value={instrDraft}
              onChange={(e) => setInstrDraft(e.target.value.slice(0, 8000))}
              rows={10}
              className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35 resize-y min-h-[180px]"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveInstructions()}
              className="mt-3 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving…' : 'Save instructions'}
            </button>
          </div>
        )}

        {tab === 'activity' && (
          <div className="max-w-2xl mx-auto px-4 py-6">
            <h2 className="font-medium mb-4">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-nyven-text-secondary">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-3"
                  >
                    <span className="text-sm text-nyven-text">{activityLabel(a.eventType)}</span>
                    <span className="text-[11px] text-nyven-text-secondary shrink-0">
                      {formatRelative(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
            <section>
              <h2 className="font-medium mb-3">General</h2>
              <label className="block mb-3">
                <span className="text-xs text-nyven-text-secondary">Name</span>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value.slice(0, 120))}
                  className="mt-1 w-full h-11 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35"
                />
              </label>
              <label className="block mb-3">
                <span className="text-xs text-nyven-text-secondary">Description</span>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value.slice(0, 2000))}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/35"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveGeneral()}
                className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50 min-h-[44px]"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </section>

            <section>
              <h2 className="font-medium mb-3">Tasks</h2>
              <div className="flex gap-2 mb-3">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="New task"
                  className="flex-1 h-11 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => void addTask()}
                  className="px-3 rounded-xl border border-white/[0.1] text-sm min-h-[44px]"
                >
                  Add
                </button>
              </div>
              <ul className="space-y-1">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm py-1">
                    <button type="button" onClick={() => void toggleTaskDone(t)}>
                      {t.status === 'done' ? <Check size={14} className="text-nyven-cyan" /> : <ListTodo size={14} />}
                    </button>
                    <span className={clsx(t.status === 'done' && 'line-through opacity-60')}>
                      {t.title}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="border border-red-400/20 rounded-2xl p-4">
              <h2 className="font-medium text-red-300/90 mb-2">Danger zone</h2>
              <p className="text-xs text-nyven-text-secondary mb-3">
                Permanently delete this project. Type DELETE to confirm.
              </p>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full h-11 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm mb-2 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 text-sm text-red-400/90 min-h-[44px]"
              >
                <Trash2 size={14} /> Delete project
              </button>
            </section>
          </div>
        )}
      </div>

      {/* Mobile bottom tabs */}
      <nav className="sm:hidden shrink-0 border-t border-white/[0.07] flex pb-[env(safe-area-inset-bottom)]">
        {mobileTabs.map(({ id, label, icon: Icon }) => (
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
    </div>
  )
}
