/**
 * Professional conversation history — ChatGPT/Grok-style groups, search, rename, delete.
 * Uses existing Conversation persistence; no parallel storage.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2, Pencil, X, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import type { Conversation } from '../lib/types'
import { NIdentity } from './NIdentity'

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

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const

function groupLabel(ts: number): (typeof GROUP_ORDER)[number] {
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

  // Mobile drawer: prevent background scroll
  useEffect(() => {
    if (variant !== 'mobile') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [variant])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? conversations
      : conversations.filter((c) => (c.title || '').toLowerCase().includes(q))
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [conversations, query])

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const c of filtered) {
      const g = groupLabel(c.updatedAt || Date.now())
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(c)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      label: g,
      items: map.get(g)!,
    }))
  }, [filtered])

  const startEdit = (c: Conversation) => {
    setEditingId(c.id)
    setEditTitle(c.title || '')
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
        'flex flex-col h-full bg-[#0a0b10]/98 backdrop-blur-xl border-white/[0.06]',
        variant === 'desktop'
          ? 'border-r w-[260px] lg:w-[280px] shrink-0'
          : 'w-[min(100vw,320px)] border-r shadow-2xl'
      )}
      role="navigation"
      aria-label="Chat history"
    >
      {/* Brand + close */}
      <div className="flex items-center gap-2.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <NIdentity state="white" size={22} />
        <span className="font-display font-semibold text-[15px] tracking-tight flex-1">
          NYVEN
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Close history"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            onNew()
            onClose?.()
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-nyven-surface border border-white/[0.08] text-sm font-medium text-nyven-text hover:border-nyven-cyan/25 hover:bg-white/[0.04] transition-colors min-h-[44px]"
        >
          <Plus size={16} className="text-nyven-cyan" />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-nyven-text-secondary pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-nyven-text placeholder:text-nyven-text-secondary/70 outline-none focus:border-nyven-cyan/30"
            aria-label="Search conversations"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {loading && (
          <p className="text-xs text-nyven-text-secondary px-3 py-4">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center text-center px-4 py-10 text-nyven-text-secondary">
            <MessageSquare size={28} className="mb-3 opacity-40" />
            <p className="text-sm">
              {query.trim() ? 'No matching chats' : 'No conversations yet'}
            </p>
            <p className="text-xs mt-1 opacity-70">Start a new chat to begin</p>
          </div>
        )}

        {groups.map(({ label, items }) => (
          <div key={label} className="mb-3">
            <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-nyven-text-secondary/80">
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map((c) => (
                <div
                  key={c.id}
                  className={clsx(
                    'group relative flex items-center gap-0.5 rounded-xl',
                    c.id === activeId
                      ? 'bg-white/[0.08] text-nyven-text'
                      : 'text-nyven-text-secondary hover:bg-white/[0.04] hover:text-nyven-text'
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
                      className="flex-1 mx-1 my-1 px-2.5 py-2 rounded-lg bg-nyven-bg border border-nyven-cyan/30 text-sm outline-none min-w-0"
                      aria-label="Rename conversation"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c)
                        onClose?.()
                      }}
                      className="flex-1 text-left px-3 py-2.5 text-sm truncate min-w-0 min-h-[44px]"
                      title={c.title}
                    >
                      {c.title || 'Untitled'}
                    </button>
                  )}
                  {editingId !== c.id && (
                    <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 pr-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Rename"
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(c)
                        }}
                        className="p-2 rounded-lg hover:bg-white/[0.06] text-nyven-text-secondary min-h-[36px] min-w-[36px] flex items-center justify-center"
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
                        className="p-2 rounded-lg hover:bg-white/[0.06] text-nyven-text-secondary hover:text-red-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
