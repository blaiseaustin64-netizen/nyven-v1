/**
 * Shared guard for NYVEN Code GitHub routes.
 * 1. Verifies the Supabase session (never trusts a client-supplied user id).
 * 2. Loads the caller's own GitHub token (RLS-independent, filtered by user id on the server).
 * Returns the token only to the route handler. It is never serialized into a response.
 */
import { resolveIdentity } from '../auth'
import { getAccessTokenForUser, type GitHubEnv } from './service'

export type GitHubRouteAuth =
  | { ok: true; userId: string; token: string }
  | { ok: false; response: Response }

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export function optionsResponse(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function authorizeGitHubRoute(
  request: Request,
  env: GitHubEnv & { SUPABASE_ANON_KEY?: string; VITE_SUPABASE_ANON_KEY?: string }
): Promise<GitHubRouteAuth> {
  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok) {
    return {
      ok: false,
      response: jsonResponse({ success: false, code: identity.code, error: identity.message }, 401),
    }
  }
  if (!identity.identity.authenticated || !identity.identity.userId) {
    return {
      ok: false,
      response: jsonResponse({ success: false, code: 'AUTH_REQUIRED', error: 'Sign in to use NYVEN Code.' }, 401),
    }
  }
  const userId = identity.identity.userId
  const result = await getAccessTokenForUser(env, userId)
  if (!result.ok) {
    const status =
      result.code === 'NOT_CONNECTED' ? 400 : result.code === 'DECRYPT' ? 500 : 503
    return {
      ok: false,
      response: jsonResponse({ success: false, code: result.code, error: result.error }, status),
    }
  }
  return { ok: true, userId, token: result.token }
}
