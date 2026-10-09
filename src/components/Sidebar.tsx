import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  MessageSquare,
  FolderOpen,
  Bot,
  Sparkles,
  Settings,
  User,
  Plus,
  Menu,
  X,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { NIdentity } from './NIdentity'
import { useAuth } from '../lib/auth/AuthContext'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
import type { Conversation } from '../lib/types'

const mainNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/agents', label: 'Agents', icon: Bot },
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
  const { user, configured } = useAuth()
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

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200',
      isActive
        ? 'bg-nyven-surface text-nyven-cyan'
        : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03]'
    )

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

  const content = (
    <div className="flex flex-col h-full min-h-0">
      {/* Brand */}
      <div className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 flex items-center gap-3 shrink-0">
        <NIdentity state="white" size={28} />
        <span className="font-display font-semibold text-lg tracking-tight">NYVEN</span>
      </div>

      {/* New Chat */}
      <div className="px-3 mb-3 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-nyven-surface/80 border border-white/[0.06] text-sm font-medium text-nyven-text hover:bg-nyven-surface hover:border-nyven-cyan/20 transition-all duration-200 min-h-[44px]"
        >
          <Plus size={16} className="text-nyven-cyan" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 mb-2 shrink-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-nyven-text-secondary pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-nyven-text placeholder:text-nyven-text-secondary/70 outline-none focus:border-nyven-cyan/30"
            aria-label="Search conversations"
          />
        </div>
      </div>

      {/* Conversation list — independently scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
        {loading && (
          <p className="text-xs text-nyven-text-secondary px-3 py-3">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-nyven-text-secondary px-3 py-3">
            {query.trim() ? 'No matching chats' : 'No conversations yet'}
          </p>
        )}
        {groups.map(({ label, items }) => (
          <div key={label} className="mb-2">
            <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-nyven-text-secondary/80">
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map((c) => (
                <div
                  key={c.id}
                  className={clsx(
                    'group relative flex items-center rounded-xl',
                    onChatRoute && c.id === activeId
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
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelect(c)}
                        className="flex-1 text-left px-3 py-2.5 text-sm truncate min-w-0 min-h-[40px]"
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
                          className={clsx(
                            'p-2 rounded-lg text-nyven-text-secondary hover:bg-white/[0.06] hover:text-nyven-text',
                            'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                            menuId === c.id && 'opacity-100'
                          )}
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
                            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-white/[0.08] bg-nyven-surface shadow-xl py-1">
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-nyven-text hover:bg-white/[0.05]"
                                onClick={() => {
                                  setEditingId(c.id)
                                  setEditTitle(c.title || '')
                                  setMenuId(null)
                                }}
                              >
                                <Pencil size={14} />
                                Rename
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-white/[0.05]"
                                onClick={() => {
                                  deleteConversation(c.id)
                                  setMenuId(null)
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
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

      {/* Compact nav links */}
      <nav className="shrink-0 px-3 pt-2 border-t border-white/[0.06] space-y-0.5">
        {mainNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={linkClass}
            onClick={onMobileClose}
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
        <NavLink to="/nyven-plus" className={linkClass} onClick={onMobileClose}>
          <Sparkles size={18} strokeWidth={1.75} />
          NYVEN+
        </NavLink>
      </nav>

      {/* Account / Settings footer */}
      <div className="shrink-0 px-3 py-3 border-t border-white/[0.06] space-y-0.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NavLink to="/settings" className={linkClass} onClick={onMobileClose}>
          <Settings size={18} strokeWidth={1.75} />
          Settings
        </NavLink>
        <NavLink to="/profile" className={linkClass} onClick={onMobileClose}>
          <User size={18} strokeWidth={1.75} />
          Profile
        </NavLink>
        {configured && (
          <div className="pt-1">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  navigate('/settings')
                  onMobileClose?.()
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03] truncate"
              >
                {user.email}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  navigate('/auth')
                  onMobileClose?.()
                }}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium text-nyven-cyan hover:bg-nyven-cyan/10"
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] xl:w-[280px] shrink-0 border-r border-white/[0.05] bg-nyven-bg-secondary/40 h-full min-h-0">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[min(100vw,300px)] bg-nyven-bg-secondary border-r border-white/[0.06] shadow-2xl flex flex-col min-h-0">
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={onMobileClose}
                className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05] min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            {content}
          </aside>
        </div>
      )}
    </>
  )
}

export function MobileNavBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="lg:hidden flex items-center justify-between px-3 h-12 border-b border-white/[0.05] shrink-0 bg-nyven-bg/80 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onMenuOpen}
        className="p-2 -ml-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <NIdentity state="white" size={22} />
        <span className="font-display font-semibold text-base">NYVEN</span>
      </div>
      <div className="w-10" />
    </header>
  )
}

export function MobileBottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/chat', label: 'Chat', icon: MessageSquare },
    { to: '/projects', label: 'Projects', icon: FolderOpen },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.06] bg-nyven-bg/95 backdrop-blur-md safe-bottom">
      <div className="flex items-center justify-around h-14 px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors',
                isActive ? 'text-nyven-cyan' : 'text-nyven-text-secondary'
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
