import { ChevronDown } from 'lucide-react'

/** Shared jump-to-latest control (same look in normal chat and project chat). */
export function JumpToLatestButton({
  visible,
  onClick,
}: {
  visible: boolean
  onClick: () => void
}) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full bg-nyven-surface border border-white/15 shadow-lg flex items-center justify-center text-nyven-text hover:border-nyven-cyan/40"
      aria-label="Jump to latest"
      title="Jump to latest"
    >
      <ChevronDown size={20} strokeWidth={2} />
    </button>
  )
}
