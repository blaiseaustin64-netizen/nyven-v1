import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { NIdentity } from '../components/NIdentity'
import { useAuth } from '../lib/auth/AuthContext'
import { migrateLocalToSupabase } from '../lib/chatPersistence'

export function Auth() {
  const { signIn, signUp, configured, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

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
          return
        }
        const sbUser = (await import('../lib/supabase/client')).getSupabase()
        const session = await sbUser?.auth.getSession()
        const uid = session?.data.session?.user?.id
        if (uid) {
          const n = await migrateLocalToSupabase(uid)
          if (n > 0) setInfo(`Migrated ${n} local conversation(s) to your account.`)
        }
        navigate('/chat')
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        const res = await signUp(email.trim(), password, displayName.trim() || undefined)
        if (res.error) {
          setError(res.error)
          return
        }
        setInfo('Check your email to confirm your account if required, then sign in.')
        setMode('signin')
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
            Set <code className="text-nyven-cyan">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-nyven-cyan">VITE_SUPABASE_ANON_KEY</code>, then run the Phase 6
            SQL migration in your Supabase project.
          </p>
          <Link to="/chat" className="text-sm text-nyven-cyan hover:underline">
            Continue as guest
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <NIdentity state="white" size={44} className="mb-4 opacity-90" />
          <h1 className="font-display text-2xl font-medium">
            {mode === 'signin' ? 'Sign in to NYVEN' : 'Create your account'}
          </h1>
          <p className="text-sm text-nyven-text-secondary mt-2 text-center">
            Sync conversations, memory, and preferences across devices.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 space-y-4"
        >
          {mode === 'signup' && (
            <div>
              <label className="text-xs text-nyven-text-secondary mb-1 block">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nyven-cyan/40"
                placeholder="Optional"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-nyven-text-secondary mb-1 block">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nyven-cyan/40"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs text-nyven-text-secondary mb-1 block">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nyven-cyan/40"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}
          {info && <p className="text-xs text-nyven-cyan">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="text-center text-sm text-nyven-text-secondary mt-4">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button type="button" className="text-nyven-cyan" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="text-nyven-cyan" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="text-center mt-3">
          <Link to="/chat" className="text-xs text-nyven-text-secondary hover:text-nyven-text">
            Continue as guest
          </Link>
        </p>
      </div>
    </div>
  )
}
