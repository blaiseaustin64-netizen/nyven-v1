/**
 * Shared guard for NYVEN Code GitHub routes.
 * Supports authenticated Supabase users (DB token) and pre-account cookie store.
 * Token is never serialized into a response.
 */
import { resolveIdentity } from '../auth'
import { getAccessTokenForUser, type GitHubEnv } from './service'
import {
  loadPreAccountGitHub,
  resolvePreAccountOwner,
} from './preAccount'

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
  if (!identity.ok && identity.code === 'AUTH_INVALID') {
    return {
      ok: false,
      response: jsonResponse({ success: false, code: identity.code, error: identity.message }, 401),
    }
  }

  if (identity.ok && identity.identity.authenticated && identity.identity.userId) {
    const result = await getAccessTokenForUser(env, identity.identity.userId)
    if (result.ok) {
      return { ok: true, userId: identity.identity.userId, token: result.token }
    }
    // Fall through to pre-account cookie if DB has no connection
  }

  if (!env.CONNECTOR_TOKEN_SECRET) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          code: 'NOT_CONNECTED',
          error: 'GitHub is not connected. Connect GitHub to continue.',
        },
        400
      ),
    }
  }

  const owner = await resolvePreAccountOwner(request, env.CONNECTOR_TOKEN_SECRET)
  const store = await loadPreAccountGitHub(request, env.CONNECTOR_TOKEN_SECRET, owner.ownerId)
  if (!store?.access_token) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          code: 'NOT_CONNECTED',
          error: 'GitHub is not connected. Connect GitHub to continue.',
        },
        400
      ),
    }
  }

  return { ok: true, userId: owner.ownerId, token: store.access_token }
}
