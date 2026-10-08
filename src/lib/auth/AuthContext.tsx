import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import type { ProfileRow } from '../supabase/types'

type AuthState = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.warn('profile fetch', error.message)
    return null
  }
  return data as ProfileRow | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [loading, setLoading] = useState(configured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }

    let mounted = true
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        void fetchProfile(data.session.user.id).then((p) => {
          if (mounted) setProfile(p)
        })
      }
      setLoading(false)
    })

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) {
        void fetchProfile(next.user.id).then(setProfile)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [configured])

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase()
    if (!sb) return { error: 'Authentication is not configured.' }
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return {}
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const sb = getSupabase()
      if (!sb) return { error: 'Authentication is not configured.' }
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
        },
      })
      if (error) return { error: error.message }
      return {}
    },
    []
  )

  const signOut = useCallback(async () => {
    const sb = getSupabase()
    if (!sb) return
    await sb.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      setProfile(await fetchProfile(session.user.id))
    }
  }, [session])

  const value = useMemo<AuthState>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [configured, loading, session, profile, signIn, signUp, signOut, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
