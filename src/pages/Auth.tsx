import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../lib/auth/AuthContext'
import nMark from '../assets/nyven-n-white.png'
import wordmark from '../assets/nyven-wordmark.png'
import { WordmarkIntro } from '../components/WordmarkIntro'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'verify'

const INPUT =
  'w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.1] px-3.5 text-base text-nyven-text ' +
  'placeholder:text-nyven-text-secondary/60 outline-none transition-colors ' +
  'focus:border-nyven-cyan/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-nyven-cyan/20'

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

function Field({ label, children, htmlFor, hint }: { label: string; children: ReactNode; htmlFor: string; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-nyven-text-secondary">
        {label}
      </label>
      {children}
      {hint}
    </div>
  )
}

/** Password input with a show/hide (eye) button. */
function PasswordField({
  label, value, onChange, autoComplete, hint, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  hint?: ReactNode
  placeholder?: string
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          className={clsx(INPUT, 'pr-12')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-nyven-text-secondary hover:text-nyven-text active:bg-white/[0.06]"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
    </Field>
  )
}

function strength(pw: string): { score: number; label: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) {
    return <p className="text-xs text-nyven-text-secondary/80">Use at least 8 characters.</p>
  }
  const { score, label } = strength(password)
  const colors = ['bg-red-400', 'bg-red-400', 'bg-amber-300', 'bg-nyven-cyan', 'bg-emerald-400']
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={clsx('h-1 flex-1 rounded-full', i <= score ? colors[score] : 'bg-white/10')} />
        ))}
      </div>
      <p className="text-xs text-nyven-text-secondary/80">Strength: {label}</p>
    </div>
  )
}

const TITLES: Record<Mode, { title: string; sub: string }> = {
  signin: { title: 'Welcome back', sub: 'Sign in to continue to NYVEN.' },
  signup: { title: 'Create your account', sub: 'Your chats and settings, saved and synced.' },
  verify: { title: 'Verify your email', sub: 'Enter the six-digit code we sent you. It expires in 5 minutes.' },
  forgot: { title: 'Reset password', sub: "Enter your email and we'll send a reset link." },
  reset: { title: 'Choose a new password', sub: 'Pick something strong you have not used before.' },
}

export function Auth() {
  const {
    signIn, signUp, configured, user, loading, requestPasswordReset, resetPassword,
    verifyEmail, verifyEmailCode, resendVerification,
  } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState('')
  const emailId = useId()
  const nameId = useId()
  const codeId = useId()

  useEffect(() => {
    const verify = params.get('verify')
    const reset = params.get('reset')
    if (verify) {
      setBusy(true)
      void verifyEmail(verify).then((r) => {
        setBusy(false)
        if (r.error) setError(r.error)
        else {
          setInfo('Email verified. You can sign in.')
          setMode('signin')
        }
      })
    } else if (reset) {
      setResetToken(reset)
      setMode('reset')
    }
  }, [params, verifyEmail])

  // Already signed in: go to the app (never navigate during render).
  useEffect(() => {
    if (user) navigate('/chat', { replace: true })
  }, [user, navigate])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirmPassword('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const res = await signIn(email.trim(), password)
        if (res.error) {
          setError(res.error)
          if (res.code === 'EMAIL_NOT_VERIFIED') {
            setMode('verify')
            setInfo('Your email is not verified yet. Enter the six-digit code we sent you, or request a new one.')
          }
          return
        }
        navigate('/chat')
      } else if (mode === 'signup') {
        if (password.length < 8) return setError('Password must be at least 8 characters.')
        if (password !== confirmPassword) return setError('Passwords do not match.')
        const res = await signUp(email.trim(), password, displayName.trim() || undefined)
        if (res.error) return setError(res.error)
        setInfo(res.message || 'Account created. Check your email for the six-digit verification code. It expires in 5 minutes.')
        setVerificationCode('')
        setMode('verify')
      } else if (mode === 'verify') {
        const res = await verifyEmailCode(email.trim(), verificationCode.trim())
        if (res.error) return setError(res.error)
        setInfo('Email verified successfully. You can now sign in.')
        setPassword('')
        setConfirmPassword('')
        setVerificationCode('')
        setMode('signin')
      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email.trim())
        if (res.error) setError(res.error)
        else setInfo(res.message || 'If an account exists, reset instructions were sent.')
      } else if (mode === 'reset') {
        if (password.length < 8) return setError('Password must be at least 8 characters.')
        const res = await resetPassword(resetToken, password)
        if (res.error) setError(res.error)
        else {
          setInfo('Password updated. Sign in with your new password.')
          setPassword('')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const r = await resendVerification(email.trim())
      if (r.error) setError(r.error)
      else setInfo(r.message || 'If the account needs verification, a new code has been sent.')
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: ReactNode) => (
    <div className="relative min-h-full flex flex-col lg:flex-row overflow-hidden">
      {/* ambient glow, brand colours only */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 w-[26rem] h-[26rem] rounded-full bg-nyven-cyan/[0.07] blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-nyven-violet/[0.09] blur-3xl" />
      </div>

      {/* Brand panel: desktop only */}
      <aside className="relative hidden lg:flex lg:w-[46%] xl:w-1/2 flex-col justify-between p-12 border-r border-white/[0.06]">
        <img src={wordmark} alt="NYVEN" className="h-5 w-auto self-start opacity-90" />
        <div className="space-y-6 max-w-md">
          <img src={nMark} alt="" aria-hidden className="h-24 w-auto opacity-90" />
          <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">
            Your AI workspace,
            <br />
            <span className="text-nyven-cyan">in one place.</span>
          </h2>
          <p className="text-nyven-text-secondary leading-relaxed">
            Chat, code and build with NYVEN. Sign in to keep your conversations and settings with you on every device.
          </p>
        </div>
        <p className="text-xs text-nyven-text-secondary/70">© {new Date().getFullYear()} VEXDYN</p>
      </aside>

      <main className="relative flex-1 flex flex-col items-center justify-start lg:justify-center px-5 sm:px-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-[26rem]">
          {/* Brand header: mobile/tablet */}
          <div className="lg:hidden flex flex-col items-center text-center mb-8 pt-4">
            <WordmarkIntro />
          </div>
          {children}
        </div>
      </main>
    </div>
  )

  if (loading) {
    return shell(<div className="h-64" aria-busy="true" />)
  }

  if (!configured) {
    return shell(
      <div className="text-center space-y-3">
        <h1 className="font-display text-xl font-medium">Accounts are unavailable</h1>
        <p className="text-sm text-nyven-text-secondary">Please try again in a little while.</p>
        <Link to="/" className="inline-block text-sm text-nyven-cyan">Back home</Link>
      </div>
    )
  }

  const { title, sub } = TITLES[mode]
  const showTabs = mode === 'signin' || mode === 'signup'
  const submitLabel =
    mode === 'signup' ? 'Create account'
    : mode === 'verify' ? 'Verify email'
    : mode === 'forgot' ? 'Send reset link'
    : mode === 'reset' ? 'Update password'
    : 'Sign in'

  return shell(
    <>
      {showTabs && (
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 p-1 mb-6 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={clsx(
                'h-10 rounded-lg text-sm font-medium transition-colors',
                mode === m ? 'bg-white/[0.09] text-nyven-text shadow-sm' : 'text-nyven-text-secondary hover:text-nyven-text'
              )}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-nyven-text-secondary">{sub}</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        {mode === 'signup' && (
          <Field label="Name (optional)" htmlFor={nameId}>
            <input id={nameId} className={INPUT} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="How should we call you?" />
          </Field>
        )}

        {mode !== 'reset' && (
          <Field label="Email" htmlFor={emailId}>
            <input
              id={emailId}
              type="email"
              required
              inputMode="email"
              className={INPUT}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        )}

        {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
          <PasswordField
            label={mode === 'reset' ? 'New password' : 'Password'}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            hint={mode !== 'signin' ? <StrengthMeter password={password} /> : undefined}
          />
        )}

        {mode === 'signup' && (
          <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        )}

        {mode === 'signin' && (
          <div className="flex justify-end -mt-1">
            <button type="button" onClick={() => switchMode('forgot')} className="text-sm text-nyven-cyan py-1">
              Forgot password?
            </button>
          </div>
        )}

        {mode === 'verify' && (
          <Field label="Verification code" htmlFor={codeId}>
            <input
              id={codeId}
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              className={clsx(INPUT, 'tracking-[0.5em] text-center text-lg')}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
          </Field>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-200">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="rounded-xl border border-nyven-cyan/25 bg-nyven-cyan/10 px-3.5 py-2.5 text-sm text-nyven-cyan">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-xl bg-nyven-cyan text-[#04101a] font-semibold text-base transition active:scale-[0.99] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Please wait…' : submitLabel}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-nyven-text-secondary space-y-3">
        {mode === 'verify' && (
          <button type="button" className="text-nyven-cyan py-1" disabled={busy} onClick={resend}>
            Resend verification code
          </button>
        )}
        {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && (
          <div>
            <button type="button" className="text-nyven-cyan py-1" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          </div>
        )}
        <div>
          <Link to="/" className="text-nyven-text-secondary hover:text-nyven-text underline underline-offset-4 decoration-white/20">
            Continue as guest
          </Link>
        </div>
      </div>
    </>
  )
}
