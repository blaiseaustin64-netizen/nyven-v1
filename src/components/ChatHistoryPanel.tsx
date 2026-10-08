import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, Pencil, X, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import type { Conversation } from '../lib/types'

type Props = {
  conversations: Conversation[]
  activeId: string
  loading?: boolean
  onNew: () => void
  onSelect: (c: Conversation) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onClose?: () => void
  variant: 'desktop' | 'mobile'
}

function groupLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86400000
  if (ts >= startToday) return 'Today'
  if (ts >= startYesterday) return 'Yesterday'
  if (ts >= startToday - 7 * 86400000) return 'Previous 7 days'
  return 'Older'
}

export function ChatHistoryPanel({
  conversations,
  activeId,
  loading,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onClose,
  variant,
}: Props) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? conversations
      : conversations.filter((c) => c.title.toLowerCase().includes(q))
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [conversations, query])

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const c of filtered) {
      const g = groupLabel(c.updatedAt)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(c)
    }
    return map
  }, [filtered])

  const startEdit = (c: Conversation) => {
    setEditingId(c.id)
    setEditTitle(c.title)
  }

  const commitEdit = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim().slice(0, 120))
    }
    setEditingId(null)
  }

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-nyven-bg/95 backdrop-blur-md border-white/[0.06]',
        variant === 'desktop' ? 'border-r w-64 lg:w-72' : 'w-full max-w-sm border-l'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => {
            onNew()
            onClose?.()
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm font-medium hover:border-nyven-cyan/25 transition-colors"
        >
          <Plus size={16} className="text-nyven-cyan" />
          New chat
        </button>
        {variant === 'mobile' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.04]"
            aria-label="Close history"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-nyven-text-secondary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm outline-none focus:border-nyven-cyan/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && (
          <p className="text-xs text-nyven-text-secondary px-2 py-4">Loading conversations…</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare size={28} className="text-nyven-text-secondary/50 mb-3" />
            <p className="text-sm text-nyven-text-secondary">
              {query ? 'No matching chats' : 'No conversations yet'}
            </p>
            <p className="text-xs text-nyven-text-secondary mt-1">
              Start a new chat to begin.
            </p>
          </div>
        )}
        {[...groups.entries()].map(([label, items]) => (
          <div key={label} className="mb-3">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-nyven-text-secondary/80">
              {label}
            </div>
            {items.map((c) => (
              <div
                key={c.id}
                className={clsx(
                  'group relative flex items-center gap-1 rounded-xl mb-0.5',
                  c.id === activeId
                    ? 'bg-nyven-surface text-nyven-cyan'
                    : 'hover:bg-white/[0.03] text-nyven-text-secondary hover:text-nyven-text'
                )}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 mx-1 my-1 px-2 py-1.5 rounded-lg bg-nyven-bg border border-nyven-cyan/30 text-sm outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c)
                      onClose?.()
                    }}
                    className="flex-1 text-left px-3 py-2.5 text-sm truncate min-w-0"
                    title={c.title}
                  >
                    {c.title || 'Untitled'}
                  </button>
                )}
                {editingId !== c.id && (
                  <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 pr-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEdit(c)
                      }}
                      className="p-2 rounded-lg hover:bg-white/[0.06] text-nyven-text-secondary"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(c.id)
                      }}
                      className="p-2 rounded-lg hover:bg-white/[0.06] text-nyven-text-secondary hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
