/**
 * Server-side identity resolution (Cloudflare session cookie or Bearer token).
 * Replaces Supabase JWT verification.
 * Never trusts a client-supplied user_id.
 */

import type { D1Database } from './db/types'
import { resolveSessionUser, type AuthServiceEnv, type PublicUser } from './auth/service'

export type AuthIdentity = {
  authenticated: true
  userId: string
  email?: string
  emailVerified?: boolean
  displayName?: string | null
}

export type GuestIdentity = {
  authenticated: false
  userId?: undefined
}

export type RequestIdentity = AuthIdentity | GuestIdentity

export type AuthEnv = AuthServiceEnv & {
  DB?: D1Database
  /** Legacy names ignored for identity (kept so env objects type-check during migration). */
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export function extractBearerToken(request: Request): string | null {
  const h = request.headers.get('Authorization') || request.headers.get('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  if (!m) return null
  const token = m[1]!.trim()
  return token.length > 0 ? token : null
}

function publicToIdentity(user: PublicUser): AuthIdentity {
  return {
    authenticated: true,
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
  }
}

/**
 * Resolve caller identity from nyven_session cookie or Bearer session token.
 * Guest (no session) is not an error.
 */
export async function resolveIdentity(
  request: Request,
  env: AuthEnv,
  _signal?: AbortSignal
): Promise<
  | { ok: true; identity: RequestIdentity }
  | { ok: false; code: 'AUTH_INVALID' | 'AUTH_CONFIG'; message: string }
> {
  if (!env.DB) {
    // Without D1 we cannot validate sessions — treat as unconfigured for auth-required paths.
    // Guests still allowed when callers accept authenticated:false.
    return { ok: true, identity: { authenticated: false } }
  }

  try {
    const user = await resolveSessionUser(env, request)
    if (!user) {
      // If Authorization Bearer was sent but invalid, surface AUTH_INVALID
      if (extractBearerToken(request)) {
        return {
          ok: false,
          code: 'AUTH_INVALID',
          message: 'Session expired or invalid. Please sign in again.',
        }
      }
      return { ok: true, identity: { authenticated: false } }
    }
    return { ok: true, identity: publicToIdentity(user) }
  } catch {
    return {
      ok: false,
      code: 'AUTH_CONFIG',
      message: 'Authentication is temporarily unavailable.',
    }
  }
}

export type { PublicUser, AuthServiceEnv }
