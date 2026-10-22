import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'


async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '')
  let data: { error?: string; message?: string; code?: string; success?: boolean } = {}
  try {
    if (text) data = JSON.parse(text) as typeof data
  } catch {
    /* HTML or empty — Function missing/crashed */
  }
  if (data.error) {
    return data.code ? `${data.error} (${data.code})` : data.error
  }
  if (data.message && data.success === false) return data.message
  if (res.status === 404) {
    return 'Auth API not found (404). Redeploy with functions/api/auth/* and functions/_shared present.'
  }
  if (res.status === 503) {
    return 'Service unavailable (503). Bind D1 as DB on Production and redeploy.'
  }
  if (res.status >= 500) {
    return `Server error (${res.status}). Check Pages Function logs — often missing functions/_shared or D1.`
  }
  if (!text) return `${fallback} (HTTP ${res.status}, empty response)`
  // Truncate HTML noise
  const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
  return `${fallback} (HTTP ${res.status}${snippet ? `: ${snippet}` : ''})`
}

export type NyvenUser = {
  id: string
  email: string
  displayName: string | null
  emailVerified: boolean
  createdAt?: string
}

type AuthState = {
  configured: boolean
  loading: boolean
  session: { user: NyvenUser } | null
  user: NyvenUser | null
  profile: { id: string; display_name: string | null; email?: string } | null
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ error?: string; message?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<{ error?: string; message?: string }>
  resetPassword: (token: string, password: string) => Promise<{ error?: string }>
  verifyEmail: (token: string) => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchMe(): Promise<NyvenUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      authenticated?: boolean
      user?: NyvenUser
    }
    if (res.ok && data.success && data.authenticated && data.user) return data.user
    return null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<NyvenUser | null>(null)

  const refreshProfile = useCallback(async () => {
    const u = await fetchMe()
    setUser(u)
    setConfigured(true)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const u = await fetchMe()
      if (!mounted) return
      setUser(u)
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        return { error: await readApiError(res, 'Sign in failed.') }
      }
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        user?: NyvenUser
      }
      if (!data.success) {
        return { error: data.error || 'Sign in failed.' }
      }
      setUser(data.user || (await fetchMe()))
      return {}
    } catch {
      return { error: 'Network error reaching /api/auth/login. Is the site deployed with Pages Functions?' }
    }
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email, password, displayName }),
        })
        if (!res.ok) {
          return { error: await readApiError(res, 'Could not create account.') }
        }
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean
          error?: string
          message?: string
          code?: string
        }
        if (!data.success) {
          const detail = [data.error, data.code ? `(${data.code})` : ''].filter(Boolean).join(' ')
          return { error: detail || 'Could not create account.' }
        }
        return { message: data.message }
      } catch {
        return { error: 'Network error reaching /api/auth/register. Is the site deployed with Pages Functions?' }
      }
    },
    []
  )

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        message?: string
      }
      if (!res.ok || !data.success) return { error: data.error || 'Request failed.' }
      return { message: data.message }
    } catch {
      return { error: 'Network error.' }
    }
  }, [])

  const resetPassword = useCallback(async (token: string, password: string) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) return { error: data.error || 'Reset failed.' }
      return {}
    } catch {
      return { error: 'Network error.' }
    }
  }, [])

  const verifyEmail = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) return { error: data.error || 'Verification failed.' }
      await refreshProfile()
      return {}
    } catch {
      return { error: 'Network error.' }
    }
  }, [refreshProfile])

  const value = useMemo<AuthState>(
    () => ({
      configured,
      loading,
      session: user ? { user } : null,
      user,
      profile: user
        ? { id: user.id, display_name: user.displayName, email: user.email }
        : null,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
    }),
    [
      configured,
      loading,
      user,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
