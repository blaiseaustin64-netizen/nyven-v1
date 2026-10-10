import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-nyven-surface border border-white/[0.06] rounded-2xl ${className}`}>{children}</div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/[0.04] text-nyven-text-secondary border-white/[0.06]',
    good: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    warn: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    bad: 'bg-red-400/10 text-red-300 border-red-400/20',
    info: 'bg-nyven-cyan/10 text-nyven-cyan border-nyven-cyan/20',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-sm text-red-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
      <div className="flex-1 min-w-0">
        <p className="leading-relaxed">{message}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyNotice({ title, body }: { title: string; body?: string }) {
  return (
    <div className="py-10 px-4 text-center">
      <p className="text-sm text-nyven-text">{title}</p>
      {body && <p className="text-xs text-nyven-text-secondary mt-1 leading-relaxed">{body}</p>}
    </div>
  )
}

export function LoadingRows({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-label={label}>
      <p className="flex items-center gap-2 text-xs text-nyven-text-secondary">
        <Loader2 size={12} className="animate-spin" /> {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded-lg bg-white/[0.03] animate-pulse" />
      ))}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nyven-cyan text-nyven-bg hover:bg-nyven-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[40px]"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-white/[0.1] text-nyven-text-secondary hover:text-nyven-text hover:border-white/[0.2] disabled:opacity-50 transition-colors min-h-[36px]"
    >
      {children}
    </button>
  )
}
