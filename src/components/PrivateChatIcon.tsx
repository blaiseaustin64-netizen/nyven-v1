import { useEffect, useState } from 'react'

/**
 * Nyven private-chat mark: headphone arc, eyes, speech-bubble mouth.
 * Eyes slide into the bubble when private is on.
 */
export function PrivateChatIcon({
  active,
  onToggle,
  className = '',
}: {
  active: boolean
  onToggle: () => void
  className?: string
}) {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

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
      className={`relative w-11 h-11 rounded-full grid place-items-center border border-[var(--nyven-border)] bg-[var(--nyven-surface)] transition-colors ${
        active ? 'text-[var(--nyven-cyan)]' : 'text-[var(--nyven-text-secondary)]'
      } ${className}`}
      aria-label={active ? 'Private mode on' : 'Turn on private mode'}
      aria-pressed={active}
      title={active ? 'Private mode on' : 'Private chat'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        {/* Headphone arc */}
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
        {/* Speech bubble mouth */}
        <path
          d="M9.2 16.2h5.6c.9 0 1.6.7 1.6 1.5 0 .3-.1.6-.3.8l-1.2 1.3c-.2.2-.5.1-.6-.1l-.5-1.1H9.2c-.9 0-1.6-.7-1.6-1.5s.7-1.5 1.6-1.5z"
          fill="currentColor"
          opacity="0.9"
        />
        {/* Eyes */}
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
      {active && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: '0 0 0 0 color-mix(in srgb, var(--nyven-cyan) 40%, transparent)',
            animation: reduced ? undefined : 'nyven-private-pulse 600ms ease-out',
          }}
        />
      )}
      <style>{`
        @keyframes nyven-private-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--nyven-cyan) 45%, transparent); }
          100% { box-shadow: 0 0 0 12px transparent; }
        }
      `}</style>
    </button>
  )
}
