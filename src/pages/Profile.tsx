import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NIdentity } from '../components/NIdentity'
import { useAuth } from '../lib/auth/AuthContext'
import { getSupabase } from '../lib/supabase/client'

export function Profile() {
  const { user, profile, configured, loading, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(profile?.display_name || '')
  }, [profile])

  const save = async () => {
    if (!user) return
    const sb = getSupabase()
    if (!sb) return
    setSaving(true)
    setMsg(null)
    const { error } = await sb
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id)
    setSaving(false)
    if (error) setMsg(error.message)
    else {
      await refreshProfile()
      setMsg('Saved')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-nyven-surface border border-white/[0.08] mb-5">
            <NIdentity state="white" size={40} />
          </div>
          {loading && (
            <p className="text-sm text-nyven-text-secondary">Loading…</p>
          )}
          {!loading && (
            <>
              <h1 className="font-display text-xl font-medium mb-1">
                {user
                  ? profile?.display_name || user.email?.split('@')[0] || 'Account'
                  : 'Guest'}
              </h1>
              <p className="text-sm text-nyven-text-secondary">
                {user ? user.email : configured ? 'Sign in to sync your account' : 'Local session'}
              </p>
            </>
          )}
        </div>

        <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 text-left space-y-4 mb-6">
          {user && (
            <>
              <div>
                <label className="text-xs text-nyven-text-secondary block mb-1">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-nyven-text-secondary">Email</span>
                <span className="truncate ml-2">{user.email}</span>
              </div>
              {profile?.created_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-nyven-text-secondary">Member since</span>
                  <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                </div>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="w-full py-2.5 rounded-xl bg-nyven-cyan/15 text-nyven-cyan text-sm font-medium border border-nyven-cyan/25 hover:bg-nyven-cyan/25 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {msg && <p className="text-xs text-nyven-cyan text-center">{msg}</p>}
            </>
          )}
          {!user && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-nyven-text-secondary">Status</span>
                <span>Guest</span>
              </div>
              <p className="text-xs text-nyven-text-secondary">
                History and preferences stay on this device until you sign in.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!user && configured && (
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="w-full py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
            >
              Sign in / Sign up
            </button>
          )}
          <Link
            to="/settings"
            className="w-full py-2.5 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm font-medium hover:bg-white/[0.05] transition-colors text-center"
          >
            Settings
          </Link>
          <Link
            to="/settings?section=usage"
            className="w-full py-2.5 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm font-medium hover:bg-white/[0.05] transition-colors text-center"
          >
            Usage
          </Link>
          {user && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full py-2.5 rounded-xl text-sm text-red-400/80 hover:text-red-400"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
