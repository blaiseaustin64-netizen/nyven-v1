import { optionsResponse, jsonWithCors } from '../../../_shared/cors'
import type { D1Database } from '../../../_shared/db/types'
import { resolveSessionUser } from '../../../_shared/auth/service'
interface Env { DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string; AUTH_SESSION_SECRET?: string }
export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'POST, OPTIONS')
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const convId = String(params.id || '')
  let body: { messages?: any[]; message?: any; title?: string }
  try { body = await request.json() } catch { return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400) }
  const list = Array.isArray(body.messages) ? body.messages : body.message ? [body.message] : []
  if (!list.length) return jsonWithCors(request, env, { success: false, error: 'No messages provided' }, 400)
  if (list.length > 50) return jsonWithCors(request, env, { success: false, error: 'Too many messages' }, 400)
  const now = new Date().toISOString()
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : 'Chat'
  try {
    const conv = await env.DB.prepare(`SELECT id FROM conversations WHERE id = ? AND user_id = ?`).bind(convId, user.id).first()
    if (!conv) {
      await env.DB.prepare(`INSERT INTO conversations (id, user_id, title, pinned, project_id, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, ?, ?)`).bind(convId, user.id, title || 'Chat', now, now).run()
    }
    for (const m of list) {
      if (!m.id || !m.role || typeof m.content !== 'string') continue
      let role = m.role
      if (role === 'nyven') role = 'assistant'
      if (role !== 'assistant' && role !== 'system') role = 'user'
      const created = typeof m.createdAt === 'number' ? new Date(m.createdAt).toISOString() : (m.createdAt || now)
      await env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, user_id, role, content, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content, metadata_json = excluded.metadata_json`
      ).bind(m.id, convId, user.id, role, m.content.slice(0, 100000), JSON.stringify(m.metadata || {}), created).run()
    }
    await env.DB.prepare(`UPDATE conversations SET updated_at = ?, title = COALESCE(NULLIF(?, ''), title) WHERE id = ? AND user_id = ?`).bind(now, title, convId, user.id).run()
    return jsonWithCors(request, env, { success: true })
  } catch (e) {
    console.error('upsert messages', e instanceof Error ? e.name : 'unknown')
    return jsonWithCors(request, env, { success: false, error: 'Could not save messages' }, 500)
  }
}
