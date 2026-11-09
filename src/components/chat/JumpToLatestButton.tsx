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
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full bg-nyven-surface/90 backdrop-blur-md border border-white/10 text-nyven-text shadow-lg shadow-black/30 flex items-center justify-center hover:border-nyven-cyan/40 hover:text-nyven-cyan ${className}`}
      aria-label="Jump to latest"
      title="Jump to latest"
    >
      <ChevronDown size={20} strokeWidth={2} />
    </button>
  )
}
