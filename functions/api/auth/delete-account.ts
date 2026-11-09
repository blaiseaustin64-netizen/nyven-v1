import { optionsResponse, corsHeaders } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser, type AuthServiceEnv } from '../../_shared/auth/service'
import { verifyPassword } from '../../_shared/auth/password'
import { clearSessionCookieHeader, requestIsHttps } from '../../_shared/auth/cookies'
import { clearPreAccountGitHubCookie, clearCookieHeader, OWNER_COOKIE } from '../../_shared/github/preAccount'
import { disconnectGitHub } from '../../_shared/github/service'
import { sendEmail, type EmailEnv } from '../../_shared/email/brevo'

interface Env extends AuthServiceEnv, EmailEnv {
  DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string
  GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; CONNECTOR_TOKEN_SECRET?: string
}

function json(request: Request, env: Env, body: unknown, status: number, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(request, env, 'POST, OPTIONS') })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}

export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  if (!env.DB) return json(request, env, { success: false, error: 'Service unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return json(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  let body: { password?: string; confirmation?: string }
  try { body = await request.json() as typeof body } catch {
    return json(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  if ((body.confirmation || '').trim() !== 'DELETE') {
    return json(request, env, { success: false, code: 'VALIDATION', error: 'Type DELETE to confirm account deletion.' }, 400)
  }
  if (!body.password) return json(request, env, { success: false, code: 'VALIDATION', error: 'Password is required.' }, 400)
  const row = await env.DB.prepare(`SELECT id, password_hash, email FROM auth_users WHERE id = ?`).bind(user.id).first<{ id: string; password_hash: string; email: string }>()
  if (!row) return json(request, env, { success: false, code: 'NOT_FOUND', error: 'Account not found.' }, 404)
  if (!(await verifyPassword(body.password, row.password_hash))) {
    return json(request, env, { success: false, code: 'FORBIDDEN', error: 'Incorrect password.' }, 403)
  }
  const userId = user.id
  try { await disconnectGitHub(env, userId) } catch { /* */ }
  const stmts = [
    env.DB.prepare(`DELETE FROM messages WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)`).bind(userId),
    env.DB.prepare(`DELETE FROM conversations WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM oauth_connections WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM auth_email_tokens WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM user_memories WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM app_accounts WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM feedback WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM bug_reports WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM email_challenges WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM auth_users WHERE id = ?`).bind(userId),
  ]
  try {
    try {
      await env.DB.batch([
        ...stmts.slice(0, -1),
        env.DB.prepare(`DELETE FROM projects WHERE user_id = ?`).bind(userId),
        stmts[stmts.length - 1]!,
      ])
    } catch {
      await env.DB.batch(stmts)
    }
  } catch (e) {
    console.error('delete-account failed', e instanceof Error ? e.name : 'unknown')
    return json(request, env, { success: false, error: 'Could not delete account. Please try again.' }, 500)
  }
  const secure = requestIsHttps(request)
  try {
    void sendEmail(env, {
      to: row.email,
      subject: 'Your NYVEN account has been deleted',
      html: '<p>Your NYVEN account and associated data have been permanently deleted.</p>',
      text: 'Your NYVEN account and associated data have been permanently deleted.',
      kind: 'account_deleted',
      relatedId: userId,
    })
  } catch { /* */ }
  return json(request, env, { success: true, message: 'Account deleted.' }, 200, [
    clearSessionCookieHeader(secure),
    clearPreAccountGitHubCookie(secure),
    clearCookieHeader(OWNER_COOKIE, secure),
  ])
}
