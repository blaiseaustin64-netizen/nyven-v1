import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'
interface Env { DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string; AUTH_SESSION_SECRET?: string }
export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'GET, PUT, OPTIONS')
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  try {
    const rows = await env.DB.prepare(`SELECT id, slug, title, data_json, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.id).all()
    return jsonWithCors(request, env, {
      success: true,
      projects: (rows.results || []).map((r: any) => ({
        id: r.id, slug: r.slug, title: r.title,
        data: (() => { try { return JSON.parse(r.data_json || '{}') } catch { return {} } })(),
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not list projects' }, 500)
  }
}
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  let body: { id?: string; slug?: string; title?: string; data?: unknown }
  try { body = await request.json() } catch { return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400) }
  const id = (body.id || crypto.randomUUID()).slice(0, 64)
  const now = new Date().toISOString()
  try {
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, slug, title, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, data_json = excluded.data_json, updated_at = excluded.updated_at
       WHERE projects.user_id = excluded.user_id`
    ).bind(id, user.id, (body.slug || id).toString().slice(0, 80), (body.title || 'Project').toString().slice(0, 120), JSON.stringify(body.data ?? {}), now, now).run()
    return jsonWithCors(request, env, { success: true, id })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not save project' }, 500)
  }
}
