import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { NIdentity } from '../components/NIdentity'
import { useAuth } from '../lib/auth/AuthContext'

export function Auth() {
  const {
    signIn,
    signUp,
    configured,
    user,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    verifyEmailCode,
    resendVerification,
  } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'verify'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState('')

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

  if (user) {
    navigate('/chat', { replace: true })
  }

  const submit = async (e: React.FormEvent) => {
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
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          return
        }
        const res = await signUp(email.trim(), password, displayName.trim() || undefined)
        if (res.error) {
          setError(res.error)
          return
        }
        setInfo(res.message || 'Account created. Check your email for the six-digit verification code. It expires in 5 minutes.')
        setVerificationCode('')
        setMode('verify')
      } else if (mode === 'verify') {
        const res = await verifyEmailCode(email.trim(), verificationCode.trim())
        if (res.error) { setError(res.error); return }
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
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        const res = await resetPassword(resetToken, password)
        if (res.error) setError(res.error)
        else {
          setInfo('Password updated. Sign in with your new password.')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <NIdentity state="white" size={48} className="mx-auto opacity-80" />
          <h1 className="font-display text-xl font-medium">Authentication unavailable</h1>
          <p className="text-sm text-nyven-text-secondary">
            Cloudflare D1 auth is not configured. Bind the <code className="text-nyven-cyan">DB</code>{' '}
            database on Pages and apply migrations.
          </p>
          <Link to="/" className="text-sm text-nyven-cyan">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <NIdentity state="white" size={48} className="mx-auto opacity-80" />
          <h1 className="font-display text-xl font-medium">
            {mode === 'verify'
              ? 'Verify your email'
              : mode === 'signup'
              ? 'Create account'
              : mode === 'forgot'
                ? 'Reset password'
                : mode === 'reset'
                  ? 'Choose new password'
                  : 'Sign in'}
          </h1>
          <p className="text-sm text-nyven-text-secondary">{mode === 'verify' ? 'Enter the six-digit code sent to your inbox. It expires in 5 minutes.' : 'NYVEN account via Cloudflare Auth'}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-nyven-surface p-6">
          {mode !== 'reset' && mode !== 'forgot' && mode === 'signup' && (
            <label className="block text-sm">
              <span className="text-nyven-text-secondary">Display name</span>
              <input
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label className="block text-sm">
              <span className="text-nyven-text-secondary">Email</span>
              <input
                type="email"
                required
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          )}
          {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
            <label className="block text-sm">
              <span className="text-nyven-text-secondary">Password</span>
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </label>
          )}
          {mode === 'signup' && (
            <label className="block text-sm">
              <span className="text-nyven-text-secondary">Confirm password</span>
              <input type="password" required className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {mode === 'verify' && (
            <label className="block text-sm">
              <span className="text-nyven-text-secondary">Six-digit verification code</span>
              <input type="text" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 tracking-[0.35em] text-center" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
            </label>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
          {info && <p className="text-sm text-nyven-cyan">{info}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-nyven-cyan/90 text-black font-medium py-2.5 disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'verify'
                ? 'Verify email'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'reset'
                    ? 'Update password'
                    : 'Sign in'}
          </button>
        </form>

        <div className="text-center text-sm text-nyven-text-secondary space-y-2">
          {mode === 'signin' && (
            <>
              <button type="button" className="text-nyven-cyan" onClick={() => setMode('signup')}>
                Create an account
              </button>
              <div>
                <button type="button" className="underline" onClick={() => setMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            </>
          )}
          {mode === 'verify' && (
            <button type="button" className="underline" disabled={busy} onClick={async () => { setError(null); setInfo(null); setBusy(true); try { const r = await resendVerification(email.trim()); if (r.error) setError(r.error); else setInfo(r.message || 'If the account needs verification, a new code has been sent.'); } finally { setBusy(false); } }}>Resend verification code</button>
          )}
          {mode !== 'signin' && (
            <button type="button" className="text-nyven-cyan" onClick={() => { setMode('signin'); setError(null); }}>
              Back to sign in
            </button>
          )}
          <div>
            <Link to="/" className="underline">
              Continue as guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
