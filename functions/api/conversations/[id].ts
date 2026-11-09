import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'
interface Env { DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string; AUTH_SESSION_SECRET?: string }
export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'GET, PUT, DELETE, OPTIONS')
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  try {
    const conv = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ? AND user_id = ? AND (deleted_at IS NULL OR deleted_at = '')`).bind(id, user.id).first()
    if (!conv) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Not found' }, 404)
    const msgs = await env.DB.prepare(`SELECT id, role, content, metadata_json, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`).bind(id).all()
    return jsonWithCors(request, env, {
      success: true, conversation: conv,
      messages: (msgs.results || []).map((m: any) => ({
        id: m.id, role: m.role === 'assistant' ? 'nyven' : m.role, content: m.content,
        timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
        metadata: (() => { try { return JSON.parse(m.metadata_json || '{}') } catch { return {} } })(),
      })),
    })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not load conversation' }, 500)
  }
}
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  let body: { title?: string; pinned?: boolean; project_id?: string | null }
  try { body = await request.json() } catch { return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400) }
  const now = new Date().toISOString()
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : null
  const pinned = typeof body.pinned === 'boolean' ? (body.pinned ? 1 : 0) : null
  const projectId = body.project_id === null ? null : typeof body.project_id === 'string' ? body.project_id : undefined
  try {
    const existing = await env.DB.prepare(`SELECT id FROM conversations WHERE id = ? AND user_id = ?`).bind(id, user.id).first()
    if (!existing) {
      await env.DB.prepare(`INSERT INTO conversations (id, user_id, title, pinned, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, title || 'Chat', pinned ?? 0, projectId ?? null, now, now).run()
    } else {
      const sets = ['updated_at = ?']; const binds: unknown[] = [now]
      if (title !== null) { sets.push('title = ?'); binds.push(title) }
      if (pinned !== null) { sets.push('pinned = ?'); binds.push(pinned) }
      if (projectId !== undefined) { sets.push('project_id = ?'); binds.push(projectId) }
      binds.push(id, user.id)
      await env.DB.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds).run()
    }
    return jsonWithCors(request, env, { success: true })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not update conversation' }, 500)
  }
}
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  try {
    await env.DB.prepare(`DELETE FROM messages WHERE conversation_id = ?`).bind(id).run()
    await env.DB.prepare(`DELETE FROM conversations WHERE id = ? AND user_id = ?`).bind(id, user.id).run()
    return jsonWithCors(request, env, { success: true })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not delete conversation' }, 500)
  }
}
