import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  MessageSquare,
  FolderOpen,
  Code2,
  Sparkles,
  Settings,
  Plus,
  Menu,
  X,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { NIdentity } from './NIdentity'
import { useAuth } from '../lib/auth/AuthContext'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
import type { Conversation } from '../lib/types'

/** Real NYVEN routes only — no Agents / demo bot */
const mainNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/code', label: 'Code', icon: Code2 },
]

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const onChatRoute = location.pathname.startsWith('/chat')

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

  const handleNewChat = () => {
    startNewChat()
    onMobileClose?.()
  }

  const handleSelect = (c: Conversation) => {
    openConversation(c)
    onMobileClose?.()
    setMenuId(null)
  }

  const commitEdit = () => {
    if (editingId && editTitle.trim()) {
      renameConversation(editingId, editTitle.trim())
    }
    setEditingId(null)
    setMenuId(null)
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'relative flex items-center gap-3 w-full px-3 rounded-xl text-sm font-medium transition-colors min-h-[44px]',
      collapsed && 'lg:justify-center lg:px-0',
      isActive
        ? 'bg-white/[0.08] text-[#e9edf5]'
        : 'text-[#6f7a90] hover:text-[#e9edf5] hover:bg-white/[0.05]'
    )

  const initial =
    (profile?.display_name || user?.displayName || user?.email || 'G')
      .trim()
      .charAt(0)
      .toUpperCase() || 'G'

  const content = (
    <div className="flex flex-col h-full min-h-0 bg-[#0b0e15]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <NIdentity state="white" size={28} />
          {!collapsed && (
            <span
              className="font-display font-semibold text-[15px] tracking-[0.2em] bg-gradient-to-r from-white via-[#9fdcff] to-[#8fa4ff] bg-clip-text text-transparent truncate"
            >
              NYVEN
            </span>
          )}
        </div>
        <button
          type="button"
          className="hidden lg:grid place-items-center w-9 h-9 rounded-[10px] text-[#6f7a90] hover:bg-white/[0.07] hover:text-[#e9edf5]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
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

      {/* New chat + search */}
      <div className="shrink-0 px-3 space-y-2.5">
        <button
          type="button"
          onClick={handleNewChat}
          className={clsx(
            'w-full flex items-center gap-2.5 h-11 rounded-xl font-semibold text-[#04101a] bg-gradient-to-br from-[#3de0ff] to-[#4f6bff] hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]',
            collapsed ? 'lg:justify-center lg:px-0' : 'px-3.5'
          )}
          title="New chat"
        >
          <Plus size={18} strokeWidth={2.25} />
          {!collapsed && <span>New chat</span>}
        </button>

        {!collapsed && (
          <label className="relative flex items-center gap-2 h-[42px] px-3 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[#6f7a90] focus-within:border-[#3de0ff]/35">
            <Search size={16} className="shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-[#e9edf5] placeholder:text-[#6f7a90]"
              aria-label="Search chats"
            />
          </label>
        )}
      </div>

      {/* Workspace nav */}
      <nav
        className="shrink-0 px-3 pt-3 pb-2 space-y-0.5"
        aria-label="Workspace"
      >
        {mainNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={linkClass}
            onClick={onMobileClose}
            title={label}
          >
            <Icon size={18} strokeWidth={1.85} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
        <NavLink
          to="/nyven-plus"
          className={linkClass}
          onClick={onMobileClose}
          title="NYVEN+"
        >
          <Sparkles size={18} strokeWidth={1.85} className="shrink-0" />
          {!collapsed && <span className="truncate">NYVEN+</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className={linkClass}
          onClick={onMobileClose}
          title="Settings"
        >
          <Settings size={18} strokeWidth={1.85} className="shrink-0" />
          {!collapsed && <span className="truncate">Settings</span>}
        </NavLink>
      </nav>

      {/* Chat history */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.07] mt-1">
        {!collapsed && (
          <p className="px-4 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-[#6f7a90]/90">
            Recents
          </p>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading && !collapsed && (
            <p className="text-xs text-[#6f7a90] px-3 py-3">Loading…</p>
          )}
          {!loading && filtered.length === 0 && !collapsed && (
            <p className="text-xs text-[#6f7a90] px-3 py-3">
              {query.trim() ? 'No matching chats' : 'No conversations yet'}
            </p>
          )}
          {!collapsed &&
            groups.map(({ label, items }) => (
              <div key={label} className="mb-2">
                <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[#6f7a90]/80">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className={clsx(
                        'group relative flex items-center rounded-xl',
                        onChatRoute && c.id === activeId
                          ? 'bg-white/[0.08] text-[#e9edf5]'
                          : 'text-[#6f7a90] hover:bg-white/[0.04] hover:text-[#e9edf5]'
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
                          className="flex-1 mx-1 my-1 px-2.5 py-2 rounded-lg bg-[#07090D] border border-[#3de0ff]/30 text-sm outline-none min-w-0"
                          aria-label="Rename conversation"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelect(c)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setMenuId(c.id)
                            }}
                            onTouchStart={() => {
                              const id = window.setTimeout(() => setMenuId(c.id), 480)
                              ;(window as unknown as { __nyvenLp?: number }).__nyvenLp = id
                            }}
                            onTouchEnd={() => {
                              const id = (window as unknown as { __nyvenLp?: number }).__nyvenLp
                              if (id) window.clearTimeout(id)
                            }}
                            onTouchMove={() => {
                              const id = (window as unknown as { __nyvenLp?: number }).__nyvenLp
                              if (id) window.clearTimeout(id)
                            }}
                            className="flex-1 text-left px-3 py-2.5 text-sm truncate min-w-0 min-h-[44px]"
                            title={c.title}
                          >
                            {c.title || 'Untitled'}
                          </button>
                          <div className="relative shrink-0 pr-0.5">
                            <button
                              type="button"
                              aria-label="Conversation actions"
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuId((id) => (id === c.id ? null : c.id))
                              }}
                              className="p-2 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-[#6f7a90] hover:text-[#e9edf5] hover:bg-white/[0.06] min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {menuId === c.id && (
                              <>
                                <button
                                  type="button"
                                  className="fixed inset-0 z-40"
                                  aria-label="Close menu"
                                  onClick={() => setMenuId(null)}
                                />
                                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-white/[0.08] bg-[#0c1018] shadow-xl py-1">
                                  <button
                                    type="button"
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e9edf5] hover:bg-white/[0.05]"
                                    onClick={() => {
                                      setEditingId(c.id)
                                      setEditTitle(c.title || '')
                                      setMenuId(null)
                                    }}
                                  >
                                    <Pencil size={13} /> Rename
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/[0.05]"
                                    onClick={() => {
                                      deleteConversation(c.id)
                                      setMenuId(null)
                                    }}
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Account footer */}
      <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            onMobileClose?.()
            navigate('/settings')
          }}
          className="w-10 h-10 rounded-full bg-[#3de0ff]/15 text-[#3de0ff] flex items-center justify-center text-sm font-semibold shrink-0 min-h-[44px] min-w-[44px]"
          aria-label="Open settings"
          title={user?.email || 'Settings'}
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
              className="shrink-0 px-3 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-[#e9edf5] hover:border-[#3de0ff]/30 min-h-[44px]"
            >
              New chat
            </button>
          </>
        )}
      </div>
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
          <aside className="absolute left-0 top-0 bottom-0 w-[min(86vw,330px)] bg-[#0b0e15] border-r border-white/[0.07] shadow-2xl flex flex-col min-h-0 animate-in slide-in-from-left duration-300">
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

export function MobileNavBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="lg:hidden flex items-center justify-between px-3 h-12 border-b border-white/[0.05] shrink-0 bg-[#07090D]/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onMenuOpen}
        className="p-2 -ml-2 rounded-lg text-[#6f7a90] hover:text-[#e9edf5] min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <NIdentity state="white" size={22} />
        <span className="font-display font-semibold text-base tracking-wide">NYVEN</span>
      </div>
      <div className="w-10" />
    </header>
  )
}

export function MobileBottomNav() {
  const items = [
    { to: '/chat', label: 'Chat', icon: MessageSquare },
    { to: '/projects', label: 'Projects', icon: FolderOpen },
    { to: '/code', label: 'Code', icon: Code2 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.06] bg-[#07090D]/95 backdrop-blur-md">
      <div className="flex items-center justify-around h-14 px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] h-full text-[11px] font-medium transition-colors',
                isActive ? 'text-[#3de0ff]' : 'text-[#6f7a90]'
              )
            }
          >
            <Icon size={20} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
