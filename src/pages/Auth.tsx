import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import wordmark from '../assets/nyven-wordmark.png'
import identity from '../assets/nyven-n-identity.png'
import { useAuth } from '../lib/auth/AuthContext'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset'

export function Auth() {
  const {
    signIn,
    signUp,
    configured,
    user,
    loading,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
  } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState('')
  const [pwScore, setPwScore] = useState(0)

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

  useEffect(() => {
    if (!loading && user) navigate('/chat', { replace: true })
  }, [user, loading, navigate])

  useEffect(() => {
    let s = 0
    if (password.length >= 8) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/\d/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    setPwScore(password ? s : 0)
  }, [password])

  const scoreColor = ['#d93a4a', '#e8892b', '#e6c229', '#3ddc97'][Math.max(pwScore - 1, 0)]

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
          return
        }
        navigate('/chat')
      } else if (mode === 'signup') {
        if (!displayName.trim()) {
          setError('Please enter your name.')
          return
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        if (!agree) {
          setError('Please agree to the terms to continue.')
          return
        }
        const res = await signUp(email.trim(), password, displayName.trim())
        if (res.error) {
          setError(res.error)
          return
        }
        setInfo(
          res.message ||
            'Account created. You can sign in now. (Email verification is sent when Brevo is configured.)'
        )
        setMode('signin')
        setPassword('')
      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email.trim())
        if (res.error) setError(res.error)
        else setInfo(res.message || 'If an account exists for that email, reset instructions were sent.')
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
          setPassword('')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="min-h-full flex items-center justify-center px-4 bg-nyven-bg">
        <div className="max-w-md text-center space-y-4">
          <img src={identity} alt="" className="w-12 h-12 mx-auto opacity-80" />
          <h1 className="font-display text-xl font-medium">Authentication unavailable</h1>
          <p className="text-sm text-nyven-text-secondary">
            Cloudflare D1 is not bound. In Pages → Settings → Functions, bind <code className="text-nyven-cyan">DB</code>{' '}
            to nyven-db, then redeploy.
          </p>
          <Link to="/" className="text-sm text-nyven-cyan">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full relative overflow-x-hidden bg-nyven-bg text-nyven-text">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full opacity-30 blur-[90px]"
          style={{ background: '#8B7CFF' }}
        />
        <div
          className="absolute -bottom-20 -right-16 w-[380px] h-[380px] rounded-full opacity-25 blur-[90px]"
          style={{ background: '#62E6FF' }}
        />
      </div>

      <nav className="relative z-10 flex items-center justify-between max-w-[1150px] mx-auto px-6 py-5">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <img src={identity} alt="" className="w-8 h-8 object-contain" draggable={false} />
          <img src={wordmark} alt="NYVEN" className="h-5 w-auto object-contain" draggable={false} />
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/chat" className="text-sm text-nyven-text-secondary hover:text-nyven-text hidden sm:inline">
            Continue as guest
          </Link>
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setError(null)
              setInfo(null)
            }}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-nyven-bg bg-gradient-to-br from-nyven-violet to-nyven-cyan hover:opacity-95 transition"
          >
            Log in
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-[1150px] mx-auto px-6 pb-16 pt-4 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
        {/* Hero copy — honest product facts only */}
        <div className="space-y-6">
          <span className="inline-block text-xs tracking-wide text-nyven-text-secondary border border-white/10 rounded-full px-3.5 py-1.5 bg-white/5 backdrop-blur">
            Early access · Cloudflare-hosted
          </span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold leading-[1.08] tracking-tight">
            AI that works the way{' '}
            <span className="bg-gradient-to-r from-nyven-violet to-nyven-cyan bg-clip-text text-transparent">
              you think
            </span>
            .
          </h1>
          <p className="text-nyven-text-secondary text-base sm:text-lg max-w-md leading-relaxed">
            NYVEN is your personal AI assistant for chat, voice, and building — with signed-in usage limits
            enforced on Cloudflare D1.
          </p>
          <ul className="space-y-3 text-sm text-nyven-text-secondary">
            <li className="flex gap-2">
              <span className="text-nyven-cyan">✓</span>
              Gemini-powered chat with streaming replies
            </li>
            <li className="flex gap-2">
              <span className="text-nyven-cyan">✓</span>
              Voice input and output when configured
            </li>
            <li className="flex gap-2">
              <span className="text-nyven-cyan">✓</span>
              Guest: 5 chats/day · Signed in: 100 chats/day
            </li>
            <li className="flex gap-2">
              <span className="text-nyven-cyan">✓</span>
              Secure accounts on Cloudflare (no Supabase Auth)
            </li>
          </ul>
        </div>

        {/* Auth card */}
        <div
          id="auth"
          className="rounded-[22px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-6 sm:p-8 shadow-nyven"
        >
          {(mode === 'signin' || mode === 'signup') && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/30 mb-6">
              <button
                type="button"
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  mode === 'signup'
                    ? 'bg-gradient-to-br from-nyven-violet to-nyven-cyan text-nyven-bg'
                    : 'text-nyven-text-secondary'
                }`}
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setInfo(null)
                }}
              >
                Sign up
              </button>
              <button
                type="button"
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  mode === 'signin'
                    ? 'bg-gradient-to-br from-nyven-violet to-nyven-cyan text-nyven-bg'
                    : 'text-nyven-text-secondary'
                }`}
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
              >
                Log in
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <>
                <div>
                  <h2 className="font-display text-xl font-medium m-0">Create your account</h2>
                  <p className="text-sm text-nyven-text-secondary mt-1 mb-0">
                    Free to start. Sign in unlocks higher daily limits.
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="font-semibold text-nyven-text-secondary">Full name</span>
                  <input
                    className="mt-1.5 w-full rounded-xl bg-black/30 border border-white/10 px-3.5 py-3 outline-none focus:border-nyven-cyan/60 focus:ring-2 focus:ring-nyven-cyan/20"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    placeholder="Your name"
                  />
                </label>
              </>
            )}

            {mode === 'signin' && (
              <div>
                <h2 className="font-display text-xl font-medium m-0">Welcome back</h2>
                <p className="text-sm text-nyven-text-secondary mt-1 mb-0">Log in to continue in NYVEN.</p>
              </div>
            )}

            {mode === 'forgot' && (
              <div>
                <h2 className="font-display text-xl font-medium m-0">Reset password</h2>
                <p className="text-sm text-nyven-text-secondary mt-1 mb-0">
                  We&apos;ll email a reset link when mail delivery is configured.
                </p>
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <h2 className="font-display text-xl font-medium m-0">Choose a new password</h2>
                <p className="text-sm text-nyven-text-secondary mt-1 mb-0">At least 8 characters.</p>
              </div>
            )}

            {mode !== 'reset' && (
              <label className="block text-sm">
                <span className="font-semibold text-nyven-text-secondary">Email</span>
                <input
                  type="email"
                  required
                  className="mt-1.5 w-full rounded-xl bg-black/30 border border-white/10 px-3.5 py-3 outline-none focus:border-nyven-cyan/60 focus:ring-2 focus:ring-nyven-cyan/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@email.com"
                />
              </label>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <label className="block text-sm">
                <span className="font-semibold text-nyven-text-secondary">Password</span>
                <div className="relative mt-1.5">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3.5 py-3 pr-16 outline-none focus:border-nyven-cyan/60 focus:ring-2 focus:ring-nyven-cyan/20"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-nyven-text-secondary"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {mode === 'signup' && (
                  <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pwScore * 25}%`, background: scoreColor }}
                    />
                  </div>
                )}
              </label>
            )}

            {mode === 'signup' && (
              <label className="flex gap-2.5 items-start text-sm text-nyven-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-nyven-cyan"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  I agree to use NYVEN responsibly and understand this is an early-access product.
                </span>
              </label>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-nyven-cyan font-semibold"
                  onClick={() => {
                    setMode('forgot')
                    setError(null)
                    setInfo(null)
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-300 font-medium" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-nyven-cyan font-medium" role="status">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl py-3 font-semibold text-nyven-bg bg-gradient-to-br from-nyven-violet to-nyven-cyan disabled:opacity-50 hover:opacity-95 transition"
            >
              {busy
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : mode === 'reset'
                      ? 'Update password'
                      : 'Log in'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-nyven-text-secondary space-y-2">
            {mode !== 'signin' && mode !== 'signup' && (
              <button
                type="button"
                className="text-nyven-cyan font-semibold"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
              >
                Back to sign in
              </button>
            )}
            <div>
              <Link to="/chat" className="underline text-nyven-text-secondary hover:text-nyven-text">
                Continue as guest
              </Link>
            </div>
          </div>
        </div>
      </main>

      <section className="relative z-10 max-w-[1150px] mx-auto px-6 pb-20">
        <h2 className="font-display text-2xl sm:text-3xl text-center mb-8 tracking-tight">
          Built into NYVEN
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              t: 'Chat & tools',
              d: 'Streaming answers with optional web search and attachments when providers are configured.',
            },
            {
              t: 'Voice',
              d: 'Speak and listen when STT/TTS providers are set on your deployment.',
            },
            {
              t: 'Fair limits',
              d: 'Server-enforced daily quotas so guests and accounts stay within set allowances.',
            },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur"
            >
              <div className="w-10 h-10 rounded-xl mb-3 bg-gradient-to-br from-nyven-violet to-nyven-cyan" />
              <h3 className="font-medium m-0 mb-1">{f.t}</h3>
              <p className="text-sm text-nyven-text-secondary m-0">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 text-center text-xs text-nyven-text-secondary py-8 border-t border-white/10">
        © {new Date().getFullYear()} NYVEN · Early access
      </footer>
    </div>
  )
}
