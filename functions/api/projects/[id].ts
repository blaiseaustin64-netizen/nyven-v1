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
    const row = await env.DB.prepare(`SELECT id, slug, title, data_json, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?`).bind(id, user.id).first<any>()
    if (!row) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Not found' }, 404)
    return jsonWithCors(request, env, {
      success: true,
      project: { id: row.id, slug: row.slug, title: row.title, data: (() => { try { return JSON.parse(row.data_json || '{}') } catch { return {} } })(), createdAt: row.created_at, updatedAt: row.updated_at },
    })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not load project' }, 500)
  }
}
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  let body: { slug?: string; title?: string; data?: unknown }
  try { body = await request.json() } catch { return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400) }
  const now = new Date().toISOString()
  try {
    const existing = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`).bind(id, user.id).first()
    if (!existing) {
      await env.DB.prepare(`INSERT INTO projects (id, user_id, slug, title, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, (body.slug || id).toString().slice(0, 80), (body.title || 'Project').toString().slice(0, 120), JSON.stringify(body.data ?? {}), now, now).run()
    } else {
      const sets = ['updated_at = ?']; const binds: unknown[] = [now]
      if (typeof body.slug === 'string') { sets.push('slug = ?'); binds.push(body.slug.slice(0, 80)) }
      if (typeof body.title === 'string') { sets.push('title = ?'); binds.push(body.title.slice(0, 120)) }
      if (body.data !== undefined) { sets.push('data_json = ?'); binds.push(JSON.stringify(body.data)) }
      binds.push(id, user.id)
      await env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds).run()
    }
    return jsonWithCors(request, env, { success: true })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not save project' }, 500)
  }
}
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  try {
    try { await env.DB.prepare(`UPDATE conversations SET project_id = NULL WHERE user_id = ? AND project_id = ?`).bind(user.id, id).run() } catch { /* */ }
    await env.DB.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).bind(id, user.id).run()
    return jsonWithCors(request, env, { success: true })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not delete project' }, 500)
  }
}
