import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  MessageSquare,
  Hammer,
  FolderOpen,
  Sparkles,
  Settings,
  User,
  Plus,
  Menu,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { NIdentity } from './NIdentity'
import { useState } from 'react'

const mainNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/build', label: 'Build', icon: Hammer },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
]

const secondaryNav = [
  { to: '/nyven-plus', label: 'NYVEN+', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: User },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200',
      isActive
        ? 'bg-nyven-surface text-nyven-cyan'
        : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03]'
    )

  const content = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <NIdentity state="white" size={28} />
        <span className="font-display font-semibold text-lg tracking-tight">NYVEN</span>
      </div>

      {/* New Chat */}
      <div className="px-3 mb-4">
        <button
          onClick={() => {
            navigate('/chat')
            onMobileClose?.()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-nyven-surface/80 border border-white/[0.06] text-sm font-medium text-nyven-text hover:bg-nyven-surface hover:border-nyven-cyan/20 transition-all duration-200"
        >
          <Plus size={16} className="text-nyven-cyan" />
          New Chat
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
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

        <div className="my-4 mx-1 border-t border-white/[0.06]" />

        {secondaryNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={linkClass}
            onClick={onMobileClose}
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer subtle */}
      <div className="px-4 py-4 text-[11px] text-nyven-text-secondary/60">
        V1 · Frontend
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-white/[0.05] bg-nyven-bg-secondary/40 h-full">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-nyven-bg-secondary border-r border-white/[0.06] shadow-2xl animate-slide-up">
            <div className="absolute top-4 right-4">
              <button
                onClick={onMobileClose}
                className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
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
    <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-white/[0.05] bg-nyven-bg/90 backdrop-blur-md safe-top">
      <button
        onClick={onMenuOpen}
        className="p-2 -ml-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <NIdentity state="white" size={22} />
        <span className="font-display font-semibold text-base">NYVEN</span>
      </div>
      <div className="w-10" /> {/* spacer */}
    </header>
  )
}

export function MobileBottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/chat', label: 'Chat', icon: MessageSquare },
    { to: '/build', label: 'Build', icon: Hammer },
    { to: '/projects', label: 'Projects', icon: FolderOpen },
  ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.06] bg-nyven-bg/95 backdrop-blur-md safe-bottom">
      <div className="flex items-center justify-around h-14 px-2">
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
