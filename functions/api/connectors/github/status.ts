/**
 * GET /api/connectors/github/status
 * Public connection status for the authenticated user (no tokens).
 *
 * `configured` is true only when GitHub OAuth can actually be initiated: all server
 * secrets are present AND APP_URL (or NYVEN_APP_URL) is a valid explicit origin.
 */
import { resolveIdentity } from '../../../_shared/auth'
import {
  githubOAuthReadiness,
  lookupGitHubConnectionRow,
  type GitHubEnv,
} from '../../../_shared/github/service'
import { toPublicConnection } from '../../../_shared/connectors'

interface Env extends GitHubEnv {}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // Configuration first: never report a ready-to-connect state when OAuth cannot start.
  const readiness = githubOAuthReadiness(env, request.url)
  if (!readiness.ok) {
    return json(
      {
        success: false,
        code: 'CONFIG',
        configured: false,
        connected: false,
        connection: null,
        error: readiness.error,
      },
      503
    )
  }

  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok) {
    return json({ success: false, code: identity.code, error: identity.message }, 401)
  }
  if (!identity.identity.authenticated || !identity.identity.userId) {
    return json(
      { success: true, configured: true, connected: false, connection: null },
      200
    )
  }

  // A failed read is unknown, not "not connected": report it as unavailable.
  const lookup = await lookupGitHubConnectionRow(env, identity.identity.userId)
  if (!lookup.ok) {
    return json(
      {
        success: false,
        code: 'DB_READ',
        configured: true,
        connected: false,
        connection: null,
        error: 'Could not read GitHub connection state. Try again shortly.',
      },
      503
    )
  }

  const row = lookup.row
  const connected = !!(row && row.status === 'connected')
  return json(
    {
      success: true,
      configured: true,
      connected,
      connection: row ? toPublicConnection(row) : null,
    },
    200
  )
}
