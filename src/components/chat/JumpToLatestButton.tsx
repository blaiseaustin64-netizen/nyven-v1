import { ChevronDown } from 'lucide-react'

/** Bottom-right of the message area; parent should be relative. Never overlaps composer. */
export function JumpToLatestButton({
  visible,
  onClick,
  className = '',
}: {
  visible: boolean
  onClick: () => void
  className?: string
}) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full bg-nyven-surface border border-white/15 shadow-lg flex items-center justify-center text-nyven-text hover:border-nyven-cyan/40 ${className}`}
      aria-label="Jump to latest"
      title="Jump to latest"
    >
      <ChevronDown size={20} strokeWidth={2} />
    </button>
  )
}
