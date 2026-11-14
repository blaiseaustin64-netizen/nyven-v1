import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, MoreHorizontal, Share2, Pencil, Copy, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import {
  deleteProject,
  fetchProjects,
  formatRelative,
  updateProject,
  type AiProject,
} from '../lib/aiProjects/api'

type Filter = 'all' | 'active' | 'archived'
type Sort = 'edited' | 'name' | 'created'

export function Projects() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<AiProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('edited')
  const [menuProject, setMenuProject] = useState<AiProject | null>(null)
  const [editProject, setEditProject] = useState<AiProject | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AiProject | null>(null)
  const longPressTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) {
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchProjects()
      setProjects(list)
    } catch {
      setError('Could not load projects.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    let list = [...projects]
    if (filter === 'active') list = list.filter((p) => p.status !== 'archived' && !p.archivedAt)
    if (filter === 'archived') list = list.filter((p) => p.status === 'archived' || !!p.archivedAt)
    list.sort((a, b) => {
      if (sort === 'name') return (a.name || a.title).localeCompare(b.name || b.title)
      if (sort === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return list
  }, [projects, filter, sort])

  const openMenu = (p: AiProject) => {
    try {
      navigator.vibrate?.(15)
    } catch {
      /* */
    }
    setMenuProject(p)
  }

  const onPressStart = (p: AiProject) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => openMenu(p), 450)
  }
  const onPressEnd = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const shareProject = async (p: AiProject) => {
    const text = `${p.name || p.title}\n\n${p.description || ''}\n\n${p.instructions || ''}`.trim()
    try {
      if (navigator.share) {
        await navigator.share({ title: p.name || p.title, text })
        return
      }
    } catch {
      /* */
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* */
    }
    setMenuProject(null)
  }

  const cloneProject = async (p: AiProject) => {
    setMenuProject(null)
    try {
      const res = await fetch(`/api/projects/${p.id}/clone`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.project?.id) {
        await load()
        navigate(`/projects/${data.project.id}`)
        return
      }
      // Fallback: create via create API if clone route missing
      const created = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${p.name || p.title} (copy)`,
          description: p.description,
          instructions: p.instructions,
        }),
      })
      const body = await created.json().catch(() => ({}))
      if (created.ok && body.project?.id) {
        await load()
        navigate(`/projects/${body.project.id}`)
      } else {
        setError('Could not clone project.')
      }
    } catch {
      setError('Could not clone project.')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const ok = await deleteProject(deleteTarget.id)
    setDeleteTarget(null)
    if (ok) await load()
  }

  const saveEdit = async () => {
    if (!editProject) return
    await updateProject(editProject.id, {
      name: editName.trim(),
      description: editDesc,
    })
    setEditProject(null)
    await load()
  }

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-nyven-text-secondary">
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <FolderOpen className="mx-auto mb-4 text-nyven-text-secondary opacity-70" size={32} />
          <h1 className="font-display text-2xl font-medium mb-2">Projects</h1>
          <p className="text-sm text-nyven-text-secondary mb-6 leading-relaxed">
            Sign in to create persistent AI workspaces.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="px-5 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium min-h-[44px]"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">
        <header className="flex items-center gap-2 mb-3">
          <h1 className="flex-1 text-center font-medium text-base">Projects</h1>
          <button
            type="button"
            onClick={() => navigate('/projects/new')}
            className="w-11 h-11 grid place-items-center text-nyven-text"
            aria-label="New project"
          >
            <Plus size={22} />
          </button>
        </header>

        <div className="flex gap-2 mb-4 overflow-x-auto">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="h-9 px-3 rounded-full bg-[var(--nyven-surface)] border border-[var(--nyven-border)] text-xs outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 px-3 rounded-full bg-[var(--nyven-surface)] border border-[var(--nyven-border)] text-xs outline-none"
          >
            <option value="edited">Last Edited</option>
            <option value="name">Name</option>
            <option value="created">Created</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-300/90 mb-3">{error}</p>}

        {loading ? (
          <p className="text-sm text-nyven-text-secondary py-12 text-center">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <FolderOpen className="mx-auto mb-3 opacity-50" size={28} />
            <p className="text-sm text-nyven-text-secondary mb-4">No projects yet.</p>
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="px-4 h-10 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
            >
              New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((p) => (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  onTouchStart={() => onPressStart(p)}
                  onTouchEnd={onPressEnd}
                  onTouchMove={onPressEnd}
                  onMouseDown={() => onPressStart(p)}
                  onMouseUp={onPressEnd}
                  onMouseLeave={onPressEnd}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openMenu(p)
                  }}
                  className="w-full aspect-square rounded-2xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] p-4 flex flex-col items-start text-left active:scale-[0.98] transition-transform"
                >
                  <FolderOpen className="text-nyven-text-secondary mb-3" size={22} />
                  <span className="text-sm font-medium line-clamp-2">{p.name || p.title}</span>
                  <span className="text-[11px] text-nyven-text-secondary mt-auto">
                    Modified: {formatRelative(p.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openMenu(p)
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center bg-nyven-hover text-[var(--nyven-text-secondary)]"
                  aria-label="Project menu"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Long-press / menu sheet */}
      {menuProject && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" onClick={() => setMenuProject(null)} />
          <div className="relative rounded-t-2xl bg-[var(--nyven-surface)] border-t border-[var(--nyven-border)] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-center py-2">
              <span className="w-10 h-1 rounded-full bg-[var(--nyven-surface)]" />
            </div>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 h-14 text-sm"
              onClick={() => void shareProject(menuProject)}
            >
              <Share2 size={18} /> Share Project
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 h-14 text-sm"
              onClick={() => {
                setEditName(menuProject.name || menuProject.title)
                setEditDesc(menuProject.description || '')
                setEditProject(menuProject)
                setMenuProject(null)
              }}
            >
              <Pencil size={18} /> Edit Project
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 h-14 text-sm"
              onClick={() => void cloneProject(menuProject)}
            >
              <Copy size={18} /> Clone Project
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 h-14 text-sm text-red-400"
              onClick={() => {
                setDeleteTarget(menuProject)
                setMenuProject(null)
              }}
            >
              <Trash2 size={18} /> Delete
            </button>
          </div>
        </div>
      )}

      {editProject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" onClick={() => setEditProject(null)} />
          <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--nyven-surface)] border border-[var(--nyven-border)] p-4">
            <h3 className="font-medium mb-3">Edit project</h3>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value.slice(0, 120))}
              className="w-full h-11 px-3 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm mb-2 outline-none"
              placeholder="Name"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value.slice(0, 2000))}
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm mb-3 outline-none resize-y"
              placeholder="Description"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditProject(null)} className="px-4 h-10 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                className="px-4 h-10 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--nyven-surface)] border border-[var(--nyven-border)] p-4">
            <p className="text-sm mb-4">
              Delete <strong>{deleteTarget.name || deleteTarget.title}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 h-10 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="px-4 h-10 rounded-xl bg-red-500/90 text-[var(--nyven-text)] text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
