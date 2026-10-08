/**
 * Server-side Supabase identity resolution.
 * Verifies the caller's access token via Supabase Auth API.
 * Never trusts a client-supplied user_id.
 */

export type AuthIdentity = {
  authenticated: true
  userId: string
  email?: string
}

export type GuestIdentity = {
  authenticated: false
  userId?: undefined
}

export type RequestIdentity = AuthIdentity | GuestIdentity

export type AuthEnv = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  /** Fallback if only Vite-style names are set on the Worker */
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

function supabaseConfig(env: AuthEnv): { url: string; anon: string } | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anon) return null
  return { url, anon }
}

/**
 * Extract Bearer token from Authorization header.
 * Does not log the token.
 */
export function extractBearerToken(request: Request): string | null {
  const h = request.headers.get('Authorization') || request.headers.get('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  if (!m) return null
  const token = m[1].trim()
  return token.length > 0 ? token : null
}

/**
 * Verify access token with Supabase Auth (`/auth/v1/user`).
 * Returns authenticated identity or an error code.
 * Guest (no token) is not an error — caller handles that.
 */
export async function resolveIdentity(
  request: Request,
  env: AuthEnv,
  signal?: AbortSignal
): Promise<
  | { ok: true; identity: RequestIdentity }
  | { ok: false; code: 'AUTH_INVALID' | 'AUTH_CONFIG'; message: string }
> {
  const token = extractBearerToken(request)

  if (!token) {
    return { ok: true, identity: { authenticated: false } }
  }

  const cfg = supabaseConfig(env)
  if (!cfg) {
    return {
      ok: false,
      code: 'AUTH_CONFIG',
      message: 'Authentication is not configured on the server.',
    }
  }

  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: cfg.anon,
      },
      signal,
    })

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: 'AUTH_INVALID',
        message: 'Session expired or invalid. Please sign in again.',
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        code: 'AUTH_INVALID',
        message: 'Could not verify session.',
      }
    }

    const data = (await res.json()) as { id?: string; email?: string }
    if (!data?.id || typeof data.id !== 'string') {
      return {
        ok: false,
        code: 'AUTH_INVALID',
        message: 'Could not verify session.',
      }
    }

    return {
      ok: true,
      identity: {
        authenticated: true,
        userId: data.id,
        email: typeof data.email === 'string' ? data.email : undefined,
      },
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return {
        ok: false,
        code: 'AUTH_INVALID',
        message: 'Authentication check cancelled.',
      }
    }
    return {
      ok: false,
      code: 'AUTH_INVALID',
      message: 'Could not verify session.',
    }
  }
}
