import { InstallPrompt } from './InstallPrompt'
import { isStandalone } from '../lib/pwa'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  FolderOpen,
  Settings,
  Plus,
  Menu,
  X,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pin,
  PanelLeftClose,
  PanelLeft,
  SquarePen,
} from 'lucide-react'
import clsx from 'clsx'
import { NIdentity } from './NIdentity'
import { useAuth } from '../lib/auth/AuthContext'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
import type { Conversation } from '../lib/types'
import { listProjects } from '../lib/projectStore'

const mainNav = [
  { to: '/chat', label: 'Chats', icon: MessageSquare },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
]

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const
const PIN_KEY = 'nyven_pinned_chats_v1'
const ARCHIVE_KEY = 'nyven_archived_chats_v1'
const CHAT_PROJECT_KEY = 'nyven_chat_projects_v1'
const PAGE_SIZE = 30

function loadArchived(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function saveArchived(s: Set<string>) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...s]))
}
function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function savePinned(ids: Set<string>) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

function loadChatProjects(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHAT_PROJECT_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function saveChatProject(chatId: string, projectId: string) {
  try {
    const map = loadChatProjects()
    map[chatId] = projectId
    localStorage.setItem(CHAT_PROJECT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function groupLabel(ts: number): (typeof GROUP_ORDER)[number] {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86400000
  if (ts >= startToday) return 'Today'
  if (ts >= startYesterday) return 'Yesterday'
  if (ts >= startToday - 7 * 86400000) return 'Previous 7 days'
  return 'Older'
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, configured } = useAuth()
  const {
    conversations,
    loading,
    activeId,
    startNewChat,
    openConversation,
    deleteConversation,
    renameConversation,
  } = useConversationHistory()

  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<'below' | 'above'>('below')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [projectSheetId, setProjectSheetId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nyven_sidebar_collapsed') === '1'
    } catch {
      return false
    }
  })
  const [pinned, setPinned] = useState<Set<string>>(() => loadPinned())
  const [archived, setArchived] = useState<Set<string>>(() => loadArchived())
  const [showArchived, setShowArchived] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [archiveToast, setArchiveToast] = useState<{ text: string; undoId?: string } | null>(null)
  const archiveToastTimer = useRef<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const holdRef = useRef<{ id: string; timer: number; moved: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const projects = useMemo(() => listProjects(), [projectSheetId])
  const projectsAvailable = projects.length > 0

  const onChatRoute = location.pathname.startsWith('/chat')

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? conversations
      : conversations.filter((c) => (c.title || '').toLowerCase().includes(q))
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [conversations, query])

  const filtered = useMemo(() => {
    const base = showArchived
      ? filteredAll.filter((c) => archived.has(c.id))
      : filteredAll.filter((c) => !archived.has(c.id))
    return base
  }, [filteredAll, archived, showArchived])

  const groups = useMemo(() => {
    const pinnedItems = filtered.filter((c) => pinned.has(c.id))
    const rest = filtered.filter((c) => !pinned.has(c.id))
    const map = new Map<string, Conversation[]>()
    for (const c of rest) {
      const g = groupLabel(c.updatedAt || Date.now())
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(c)
    }
    const out: { label: string; items: Conversation[] }[] = []
    if (pinnedItems.length) out.push({ label: 'Pinned', items: pinnedItems })
    for (const g of GROUP_ORDER) {
      if (map.has(g)) out.push({ label: g, items: map.get(g)! })
    }
    // flatten pagination across groups
    let remaining = visibleCount
    return out
      .map((g) => {
        if (remaining <= 0) return { ...g, items: [] as Conversation[] }
        const items = g.items.slice(0, remaining)
        remaining -= items.length
        return { ...g, items }
      })
      .filter((g) => g.items.length > 0)
  }, [filtered, pinned, visibleCount])

  const totalFiltered = filtered.length

  useEffect(() => {
    try {
      localStorage.setItem('nyven_sidebar_collapsed', collapsed ? '1' : '0')
    } catch {
      /* */
    }
  }, [collapsed])

  useEffect(() => {
    if (renameId) {
      const t = window.setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [renameId])

  useEffect(() => {
    if (!menuId && !renameId && !deleteId && !projectSheetId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuId(null)
        setRenameId(null)
        setDeleteId(null)
        setProjectSheetId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuId, renameId, deleteId, projectSheetId])

  const handleNewChat = () => {
    startNewChat()
    onMobileClose?.()
  }

  const handleSelect = (c: Conversation) => {
    if (holdRef.current?.moved) return
    openConversation(c)
    onMobileClose?.()
    setMenuId(null)
  }

  const toggleArchive = (id: string, opts?: { silent?: boolean }) => {
    setArchived((prev) => {
      const next = new Set(prev)
      const was = next.has(id)
      if (was) next.delete(id)
      else next.add(id)
      saveArchived(next)
      if (!opts?.silent) {
        if (archiveToastTimer.current) window.clearTimeout(archiveToastTimer.current)
        if (was) {
          setArchiveToast({ text: 'Chat restored' })
        } else {
          setArchiveToast({ text: 'Chat archived', undoId: id })
        }
        archiveToastTimer.current = window.setTimeout(() => setArchiveToast(null), 3000)
      }
      return next
    })
  }
  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      savePinned(next)
      return next
    })
  }

  const commitRename = () => {
    if (!renameId) return
    const next = renameValue.trim().slice(0, 80)
    if (!next) {
      setRenameError('Title cannot be empty')
      return
    }
    try {
      renameConversation(renameId, next)
      setRenameId(null)
      setRenameError(null)
    } catch {
      setRenameError('Could not rename. Please try again.')
    }
  }

  const confirmDelete = () => {
    if (!deleteId) return
    const wasActive = deleteId === activeId
    setPinned((prev) => {
      if (!prev.has(deleteId)) return prev
      const next = new Set(prev)
      next.delete(deleteId)
      savePinned(next)
      return next
    })
    try {
      const map = loadChatProjects()
      if (map[deleteId]) {
        delete map[deleteId]
        localStorage.setItem(CHAT_PROJECT_KEY, JSON.stringify(map))
      }
    } catch {
      /* ignore */
    }
    deleteConversation(deleteId)
    setDeleteId(null)
    setMenuId(null)
    if (wasActive) {
      navigate('/chat')
      onMobileClose?.()
    }
  }

  const openMenu = (id: string, el?: HTMLElement | null) => {
    setMenuId(id)
    if (el) {
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setMenuPos(spaceBelow < 220 ? 'above' : 'below')
    } else {
      setMenuPos('below')
    }
    try {
      navigator.vibrate?.(10)
    } catch {
      /* */
    }
  }

  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount((n) => Math.min(n + PAGE_SIZE, totalFiltered))
    }
  }

  const initial =
    (profile?.display_name || user?.displayName || user?.email || 'G')
      .trim()
      .charAt(0)
      .toUpperCase() || 'G'

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'relative flex items-center gap-3 w-full px-3 rounded-xl text-sm font-medium transition-colors min-h-[56px]',
      collapsed && 'lg:justify-center lg:px-0',
      isActive
        ? 'bg-white/[0.08] text-[#e9edf5]'
        : 'text-[#6f7a90] hover:text-[#e9edf5] hover:bg-white/[0.05]'
    )

  const renderChatRow = (c: Conversation) => {
    const active = onChatRoute && c.id === activeId
    const menuOpen = menuId === c.id
    return (
      <div
        key={c.id}
        className={clsx(
          'group relative flex items-center rounded-[14px] px-1 transition-opacity',
          menuId && !menuOpen && 'opacity-40',
          active || menuOpen ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
        )}
      >
        <button
          type="button"
          onClick={() => handleSelect(c)}
          onContextMenu={(e) => {
            e.preventDefault()
            openMenu(c.id, e.currentTarget)
          }}
          onTouchStart={(e) => {
            const target = e.currentTarget
            holdRef.current = { id: c.id, timer: 0, moved: false }
            holdRef.current.timer = window.setTimeout(() => {
              if (holdRef.current && !holdRef.current.moved) {
                openMenu(c.id, target)
              }
            }, 450)
          }}
          onTouchMove={() => {
            if (holdRef.current) holdRef.current.moved = true
          }}
          onTouchEnd={() => {
            if (holdRef.current) {
              window.clearTimeout(holdRef.current.timer)
              holdRef.current = null
            }
          }}
          className="flex-1 flex items-center gap-2.5 text-left px-3 min-h-[52px] min-w-0"
          aria-label={`Open chat ${c.title || 'Untitled'}`}
        >
          <MessageSquare
            size={16}
            className="shrink-0 text-[#6f7a90]"
            strokeWidth={1.75}
          />
          <span className="flex-1 text-[16px] text-[#e9edf5] truncate leading-snug">
            {c.title || 'Untitled'}
          </span>
          {pinned.has(c.id) && (
            <Pin size={12} className="shrink-0 text-nyven-cyan/80" aria-label="Pinned" />
          )}
        </button>
        <button
          type="button"
          aria-label="Conversation actions"
          onClick={(e) => {
            e.stopPropagation()
            if (menuId === c.id) setMenuId(null)
            else openMenu(c.id, e.currentTarget)
          }}
          className="hidden sm:flex p-2 rounded-lg opacity-0 group-hover:opacity-100 text-[#6f7a90] hover:text-[#e9edf5] hover:bg-white/[0.06] min-h-[40px] min-w-[40px] items-center justify-center shrink-0"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40"
              aria-label="Close menu"
              onClick={() => setMenuId(null)}
            />
            <div
              className={clsx(
                'hidden sm:block absolute right-2 z-50 w-[220px] rounded-[20px] border border-white/10 bg-[#0C1018]/95 backdrop-blur-xl shadow-xl shadow-black/40 py-1.5 origin-top-right animate-in fade-in zoom-in-95 duration-150',
                menuPos === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
              )}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 min-h-[52px] text-sm text-[#e9edf5] hover:bg-white/[0.05]"
                onClick={() => {
                  togglePin(c.id)
                  setMenuId(null)
                }}
              >
                <Pin size={15} />
                {pinned.has(c.id) ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 min-h-[52px] text-sm text-[#e9edf5] hover:bg-white/[0.05]"
                onClick={() => {
                  setRenameValue((c.title || '').slice(0, 80))
                  setRenameId(c.id)
                  setRenameError(null)
                  setMenuId(null)
                }}
              >
                <Pencil size={15} />
                Rename
              </button>
              {projectsAvailable && (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 min-h-[52px] text-sm text-[#e9edf5] hover:bg-white/[0.05]"
                  onClick={() => {
                    setProjectSheetId(c.id)
                    setMenuId(null)
                  }}
                >
                  <FolderOpen size={15} />
                  Add to project
                </button>
              )}
              <div className="h-px bg-white/10 my-1" />
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 min-h-[52px] text-sm text-[#F87171] hover:bg-white/[0.05]"
                onClick={() => {
                  setDeleteId(c.id)
                  setMenuId(null)
                }}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const content = (
    <div className="flex flex-col h-full min-h-0 bg-[#0b0e15]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <NIdentity state="white" size={28} />
          {!collapsed && (
            <span className="font-display font-semibold text-[15px] tracking-[0.18em] bg-gradient-to-r from-white via-[#9fdcff] to-[#8fa4ff] bg-clip-text text-transparent truncate">
              NYVEN
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          className="grid place-items-center w-9 h-9 rounded-[10px] text-[#e9edf5] hover:bg-white/[0.08] hover:text-white min-h-[40px] min-w-[40px]"
          aria-label="New chat"
          title="New chat"
        >
          <SquarePen size={18} strokeWidth={1.85} />
        </button>
        <button
          type="button"
          className="hidden lg:grid place-items-center w-9 h-9 rounded-[10px] text-[#6f7a90] hover:bg-white/[0.07] hover:text-[#e9edf5]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {onMobileClose && (
          <button
            type="button"
            className="lg:hidden grid place-items-center w-9 h-9 rounded-[10px] text-[#6f7a90] hover:bg-white/[0.07]"
            aria-label="Close menu"
            onClick={onMobileClose}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Primary New chat — full-width gradient */}
      <div className="shrink-0 px-3 space-y-2">
        <button
          type="button"
          onClick={handleNewChat}
          className={clsx(
            'w-full flex items-center gap-2.5 h-11 rounded-xl font-semibold text-[#04101a] bg-gradient-to-br from-[#3de0ff] to-[#4f6bff] hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]',
            collapsed ? 'lg:justify-center' : 'px-3.5'
          )}
        >
          <Plus size={18} strokeWidth={2.25} />
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      {/* Nav */}
      <nav className="shrink-0 px-3 pt-3 pb-2 space-y-0.5" aria-label="Workspace">
        {mainNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={linkClass}
            onClick={onMobileClose}
            title={label}
          >
            <Icon size={18} strokeWidth={1.85} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Recents */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.07] mt-1">
        {!collapsed && (
          <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-[#6f7a90]/90">
              Recents
            </p>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7a90] pointer-events-none"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setVisibleCount(PAGE_SIZE)
                }}
                placeholder="Search chats"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-[#e9edf5] placeholder:text-[#6f7a90] outline-none focus:border-[#3de0ff]/35"
                aria-label="Search chats"
              />
            </div>
          </div>
        )}
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {loading && !collapsed && (
            <div className="space-y-2 px-1 py-2" aria-busy="true" aria-label="Loading chats">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[52px] rounded-[14px] bg-white/[0.04] animate-pulse"
                />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && !collapsed && (
            <p className="text-sm text-[#6f7a90] px-3 py-6 text-center">
              No chats yet. Start a new one.
            </p>
          )}
          {!collapsed &&
            groups.map(({ label, items }) => (
              <div key={label} className="mb-2">
                <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[#6f7a90]/80 flex items-center gap-1.5">
                  {label === 'Pinned' && <Pin size={11} />}
                  {label}
                </p>
                <div className="space-y-0.5">{items.map(renderChatRow)}</div>
              </div>
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            onMobileClose?.()
            navigate('/settings')
          }}
          className="w-10 h-10 rounded-full bg-[#3de0ff]/15 text-[#3de0ff] flex items-center justify-center text-sm font-semibold shrink-0 min-h-[44px] min-w-[44px]"
          aria-label="Open settings"
        >
          {initial}
        </button>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#e9edf5] truncate">
                {profile?.display_name ||
                  user?.displayName ||
                  (user ? 'Signed in' : 'Guest')}
              </p>
              <p className="text-[11px] text-[#6f7a90] truncate">
                {user?.email || (configured ? 'Not signed in' : 'Guest')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 h-10 rounded-full bg-transparent border border-white/[0.14] text-xs font-medium text-[#9aa3b5] hover:text-[#e9edf5] hover:border-[#3de0ff]/35 hover:bg-white/[0.04] active:scale-[0.98] transition-all min-h-[44px]"
              aria-label="New chat"
            >
              <SquarePen size={14} strokeWidth={1.85} />
              New chat
            </button>
          </>
        )}
      </div>

      {/* Mobile long-press action sheet */}
      {menuId &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="sm:hidden fixed inset-0 z-[70] flex items-end justify-center">
            <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close actions" onClick={() => setMenuId(null)} />
            <div role="dialog" aria-modal="true" aria-label="Chat actions" className="relative w-full max-w-lg rounded-t-2xl border border-white/10 bg-[#0C1018] p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <p className="px-2 pb-2 text-xs text-[#6f7a90] truncate">{conversations.find((c) => c.id === menuId)?.title || 'Chat'}</p>
              <div className="space-y-1">
                <button type="button" className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left text-[#e9edf5] hover:bg-white/[0.06]" onClick={() => { const c = conversations.find((x) => x.id === menuId); setRenameValue((c?.title || '').slice(0, 80)); setRenameError(null); setRenameId(menuId); setMenuId(null) }}>
                  <Pencil size={18} className="text-[#6f7a90]" /> Rename
                </button>
                <button type="button" className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left text-[#e9edf5] hover:bg-white/[0.06]" onClick={() => { if (menuId) togglePin(menuId); setMenuId(null) }}>
                  <Pin size={18} className="text-[#6f7a90]" /> {menuId && pinned.has(menuId) ? 'Unpin' : 'Pin'}
                </button>
                {projectsAvailable && (
                  <button type="button" className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left text-[#e9edf5] hover:bg-white/[0.06]" onClick={() => { setProjectSheetId(menuId); setMenuId(null) }}>
                    <FolderOpen size={18} className="text-[#6f7a90]" /> Add to project
                  </button>
                )}
                <button type="button" className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left text-[#e9edf5] hover:bg-white/[0.06]" onClick={() => { if (menuId) toggleArchive(menuId); setMenuId(null) }}>
                  <FolderOpen size={18} className="text-[#6f7a90]" /> {menuId && archived.has(menuId) ? 'Unarchive' : 'Archive'}
                </button>
                <button type="button" className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left text-[#F87171] hover:bg-red-500/10" onClick={() => { setDeleteId(menuId); setMenuId(null) }}>
                  <Trash2 size={18} /> Delete
                </button>
              </div>
              <button type="button" className="mt-2 w-full min-h-[48px] rounded-xl text-sm font-medium text-[#6f7a90] hover:text-[#e9edf5] hover:bg-white/[0.04]" onClick={() => setMenuId(null)}>Cancel</button>
            </div>
          </div>,
          document.body
        )}

      {/* Rename dialog */}
      {renameId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Cancel rename"
            onClick={() => setRenameId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rename chat"
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0C1018] p-4 shadow-2xl"
          >
            <p className="text-sm font-medium text-[#e9edf5] mb-3">Rename chat</p>
            <input
              ref={renameInputRef}
              value={renameValue}
              maxLength={80}
              onChange={(e) => setRenameValue(e.target.value.slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
              }}
              className="w-full h-11 px-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#e9edf5] outline-none focus:border-[#3de0ff]/40"
            />
            {renameError && (
              <p className="text-xs text-red-300 mt-2">{renameError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRenameId(null)}
                className="px-4 min-h-[44px] rounded-xl text-sm text-[#6f7a90] hover:text-[#e9edf5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitRename}
                className="px-4 min-h-[44px] rounded-xl text-sm font-medium bg-[#3de0ff] text-[#04101a]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Cancel delete"
            onClick={() => setDeleteId(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0C1018] p-4 shadow-2xl"
          >
            <p className="text-sm text-[#e9edf5]">
              Delete this chat? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="px-4 min-h-[44px] rounded-xl text-sm text-[#6f7a90]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 min-h-[44px] rounded-xl text-sm font-medium bg-red-500/20 text-[#F87171] border border-red-400/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to project sheet */}
      {projectSheetId && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close"
            onClick={() => setProjectSheetId(null)}
          />
          <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0C1018] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto">
            <p className="text-sm font-medium text-[#e9edf5] mb-3">Add to project</p>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 min-h-[52px] rounded-xl text-sm text-[#e9edf5] hover:bg-white/[0.05] truncate"
                onClick={() => {
                  saveChatProject(projectSheetId, p.id)
                  setProjectSheetId(null)
                }}
              >
                {p.title || p.slug || p.id}
              </button>
            ))}
            <button
              type="button"
              className="w-full text-left px-3 min-h-[52px] rounded-xl text-sm text-nyven-cyan hover:bg-white/[0.05]"
              onClick={() => {
                setProjectSheetId(null)
                onMobileClose?.()
                navigate('/projects')
              }}
            >
              + New project
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <aside
        className={clsx(
          'hidden lg:flex flex-col shrink-0 border-r border-white/[0.07] h-full min-h-0 transition-[width] duration-300',
          collapsed ? 'w-[72px]' : 'w-[280px] xl:w-[292px]'
        )}
      >
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={onMobileClose}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[min(85vw,320px)] bg-[#0b0e15] border-r border-white/[0.07] shadow-2xl flex flex-col min-h-0"
            style={{
              animation: 'nyvenDrawerIn 240ms cubic-bezier(0.3, 0.8, 0.2, 1) both',
            }}
          >
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

export function MobileNavBar({
  onMenuOpen,
  title,
}: {
  onMenuOpen: () => void
  title?: string | null
}) {
  return (
    <header className="lg:hidden flex items-center gap-2 px-2 h-12 shrink-0 bg-transparent">
      <button
        type="button"
        onClick={onMenuOpen}
        className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>
      {title ? (
        <h1 className="flex-1 text-center text-[15px] font-medium text-nyven-text truncate pr-11">
          {title}
        </h1>
      ) : (
        <div className="flex-1" />
      )}
    </header>
  )
}
