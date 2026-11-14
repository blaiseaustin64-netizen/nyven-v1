/**
 * Nyven private-chat mark only (no circle background).
 * Eyes slide into the speech bubble when active.
 */
export function PrivateChatIcon({
  active,
  onToggle,
  className = '',
  size = 28,
}: {
  active: boolean
  onToggle: () => void
  className?: string
  size?: number
}) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.vibrate?.(12)
        } catch {
          /* */
        }
        onToggle()
      }}
      className={`w-12 h-12 grid place-items-center bg-transparent border-0 shadow-none ring-0 outline-none ${
        active ? 'text-[var(--nyven-cyan)]' : 'text-[var(--nyven-text-secondary)]'
      } ${className}`}
      aria-label={active ? 'Private mode on' : 'Turn on private mode'}
      aria-pressed={active}
      title={active ? 'Private mode on' : 'Private chat'}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6.5 11.5c0-3.2 2.6-5.8 5.5-5.8s5.5 2.6 5.5 5.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.5 11.5v2.2c0 .7.5 1.3 1.2 1.3h.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M17.5 11.5v2.2c0 .7-.5 1.3-1.2 1.3h-.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M9.2 16.2h5.6c.9 0 1.6.7 1.6 1.5 0 .3-.1.6-.3.8l-1.2 1.3c-.2.2-.5.1-.6-.1l-.5-1.1H9.2c-.9 0-1.6-.7-1.6-1.5s.7-1.5 1.6-1.5z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle
          cx="10"
          cy="11.2"
          r="1.15"
          fill="currentColor"
          style={{
            transformOrigin: '10px 16px',
            transition: reduced ? 'none' : 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 220ms ease',
            transform: active ? 'translateY(5px) scale(0.15)' : 'translateY(0) scale(1)',
            opacity: active ? 0 : 1,
          }}
        />
        <circle
          cx="14"
          cy="11.2"
          r="1.15"
          fill="currentColor"
          style={{
            transformOrigin: '14px 16px',
            transition: reduced ? 'none' : 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 220ms ease',
            transform: active ? 'translateY(5px) scale(0.15)' : 'translateY(0) scale(1)',
            opacity: active ? 0 : 1,
          }}
        />
      </svg>
    </button>
  )
}
