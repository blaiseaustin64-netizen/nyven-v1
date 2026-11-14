import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Archive, ChevronLeft, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
import { unarchiveChat, useArchivedIds } from '../lib/archiveStore'
import type { Conversation } from '../lib/types'

const PIN_KEY = 'nyven_pinned_chats_v1'
const CHAT_PROJECT_KEY = 'nyven_chat_projects_v1'

function formatWhen(ts?: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Same cleanup the sidebar does when a chat is deleted. */
function cleanupDeletedChat(id: string) {
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.includes(id)) {
        localStorage.setItem(PIN_KEY, JSON.stringify(arr.filter((x: string) => x !== id)))
      }
    }
    const rawMap = localStorage.getItem(CHAT_PROJECT_KEY)
    if (rawMap) {
      const map = JSON.parse(rawMap) as Record<string, string>
      if (map[id]) {
        delete map[id]
        localStorage.setItem(CHAT_PROJECT_KEY, JSON.stringify(map))
      }
    }
  } catch {
    /* ignore */
  }
}

export function Archived() {
  const navigate = useNavigate()
  const location = useLocation()
  const { conversations, loading, openConversation, deleteConversation } = useConversationHistory()
  const archivedIds = useArchivedIds()

  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!deleteId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteId])

  const allArchived = useMemo(
    () =>
      conversations
        .filter((c) => archivedIds.has(c.id))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [conversations, archivedIds]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allArchived
    return allArchived.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [allArchived, query])

  const showToast = (text: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  const goBack = () => {
    // Opened from Settings > Conversations; fall back there on a fresh load.
    if (location.key !== 'default') navigate(-1)
    else navigate('/settings/conversations')
  }

  const handleUnarchive = (c: Conversation) => {
    unarchiveChat(c.id)
    showToast('Chat unarchived')
  }

  const confirmDelete = () => {
    if (!deleteId) return
    const id = deleteId
    cleanupDeletedChat(id)
    deleteConversation(id)
    unarchiveChat(id)
    setDeleteId(null)
    showToast('Chat deleted')
  }

  const showEmpty = !loading && allArchived.length === 0
  const noMatches = !loading && allArchived.length > 0 && visible.length === 0

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={goBack}
            className="p-2 -ml-2 rounded-xl hover:bg-[var(--nyven-input-bg)] text-nyven-text-secondary hover:text-nyven-text min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-nyven-text">Archived chats</h1>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nyven-text-secondary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archived chats"
            aria-label="Search archived chats"
            className="nyven-search-input w-full h-11 pl-9 pr-10 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm text-[var(--nyven-text)] placeholder:text-[var(--nyven-text-secondary)] outline-none focus:border-nyven-cyan/35"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full grid place-items-center text-[var(--nyven-text-secondary)] hover:text-[var(--nyven-text)]"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {loading && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading archived chats">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] rounded-2xl bg-[var(--nyven-input-bg)] animate-pulse" />
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/60 px-6 py-12 text-center">
            <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-[var(--nyven-surface)] grid place-items-center text-nyven-text-secondary">
              <Archive size={22} strokeWidth={1.6} />
            </span>
            <p className="text-[15px] font-medium text-nyven-text">No archived chats</p>
            <p className="text-sm text-nyven-text-secondary mt-1">
              Archive a chat from the chat list and it will show up here.
            </p>
          </div>
        )}

        {noMatches && (
          <p className="text-sm text-nyven-text-secondary text-center py-10">
            No archived chats match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}

        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/80 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => openConversation(c)}
                  className="w-full text-left px-4 pt-3 pb-2 min-w-0 hover:bg-[var(--nyven-input-bg)] transition-colors"
                  aria-label={`Open chat ${c.title || 'Untitled'}`}
                >
                  <p className="text-[15px] font-medium text-nyven-text truncate">{c.title || 'Untitled'}</p>
                  <p className="text-[0.75rem] text-nyven-text-secondary mt-0.5">{formatWhen(c.updatedAt)}</p>
                </button>
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button
                    type="button"
                    onClick={() => handleUnarchive(c)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-[13px] font-medium text-nyven-cyan hover:bg-[var(--nyven-input-bg)]"
                  >
                    <RotateCcw size={15} />
                    Unarchive
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(c.id)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-[13px] font-medium text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-[max(5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[80] px-4 py-3 rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/95 backdrop-blur-xl shadow-xl text-[0.875rem] text-[var(--nyven-text)]">
          {toast}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--nyven-overlay)]"
            aria-label="Cancel delete"
            onClick={() => setDeleteId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete chat"
            className="relative w-full max-w-sm rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] p-4 shadow-2xl"
          >
            <p className="text-sm font-medium text-[var(--nyven-text)]">Delete this chat?</p>
            <p className="text-[0.8125rem] text-[var(--nyven-text-secondary)] mt-1">This cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="px-4 min-h-[44px] rounded-xl text-sm text-[var(--nyven-text-secondary)] hover:text-[var(--nyven-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 min-h-[44px] rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-400/30"
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
