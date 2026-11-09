import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'
interface Env { DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string; AUTH_SESSION_SECRET?: string }
export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'GET, OPTIONS')
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const url = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '40', 10) || 40, 1), 100)
  const before = url.searchParams.get('before')
  try {
    let sql = `SELECT c.id, c.title, c.pinned, c.project_id, c.updated_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
      FROM conversations c WHERE c.user_id = ? AND (c.deleted_at IS NULL OR c.deleted_at = '')`
    const binds: unknown[] = [user.id]
    if (before) { sql += ` AND c.updated_at < ?`; binds.push(before) }
    sql += ` ORDER BY c.updated_at DESC LIMIT ?`; binds.push(limit)
    const rows = await env.DB.prepare(sql).bind(...binds).all()
    return jsonWithCors(request, env, { success: true, conversations: rows.results || [] })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not list conversations' }, 500)
  }
}
