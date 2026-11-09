import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, Search, MessageSquare, ListTodo, FileText } from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import {
  fetchProjects,
  formatRelative,
  type AiProject,
} from '../lib/aiProjects/api'

/**
 * NYVEN AI Projects — persistent workspaces (not builder/forge sessionStorage projects).
 */
export function Projects() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<AiProject[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        (p.name || p.title || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    )
  }, [projects, query])

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
            Sign in to create persistent AI workspaces for conversations, instructions, tasks, and files.
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">Projects</h1>
            <p className="text-nyven-text-secondary text-sm mt-1.5 max-w-xl leading-relaxed">
              Persistent AI workspaces for ongoing work — instructions, chats, tasks, and context that
              stay with the project.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/projects/new')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors min-h-[44px] shrink-0"
          >
            <Plus size={18} strokeWidth={2.25} />
            New Project
          </button>
        </div>

        <div className="relative mb-6">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nyven-text-secondary pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-nyven-text placeholder:text-nyven-text-secondary outline-none focus:border-nyven-cyan/35"
            aria-label="Search projects"
          />
        </div>

        {error && (
          <p className="text-sm text-red-300/90 mb-4">{error}</p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-nyven-surface border border-white/[0.08] flex items-center justify-center mb-5">
              <FolderOpen size={28} className="text-nyven-text-secondary opacity-70" />
            </div>
            <p className="text-nyven-text font-medium mb-2">
              {query ? 'No matching projects' : 'No projects yet'}
            </p>
            <p className="text-nyven-text-secondary text-sm mb-6 max-w-sm leading-relaxed">
              {query
                ? 'Try a different search.'
                : 'Create a project to organize chats, instructions, tasks, and ongoing work with NYVEN.'}
            </p>
            {!query && (
              <button
                type="button"
                onClick={() => navigate('/projects/new')}
                className="px-5 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium min-h-[44px]"
              >
                + New Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="text-left rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors p-5 min-h-[140px] flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-medium text-[15px] text-nyven-text truncate">
                    {p.name || p.title}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.04] text-nyven-text-secondary shrink-0">
                    {p.status || 'active'}
                  </span>
                </div>
                <p className="text-sm text-nyven-text-secondary line-clamp-2 leading-relaxed flex-1">
                  {p.description || 'No description'}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px] text-nyven-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare size={12} /> {p.chatCount ?? 0} chats
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListTodo size={12} /> {p.taskCount ?? 0} tasks
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText size={12} /> {p.fileCount ?? 0} files
                  </span>
                  <span className="ml-auto">{formatRelative(p.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
