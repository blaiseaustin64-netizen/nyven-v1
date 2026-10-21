import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveIdentity, type AuthEnv } from '../_shared/auth'

interface Env extends AuthEnv {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, DELETE, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: true, memories: [], source: 'guest' }, 200)
  }
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'QUOTA_STORE_UNAVAILABLE', error: 'Storage unavailable.' },
      503
    )
  }
  const rows = await env.DB.prepare(
    `SELECT id, content, memory_type, source, enabled, created_at, updated_at
     FROM user_memories WHERE user_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 200`
  )
    .bind(idRes.identity.userId)
    .all()
  return jsonWithCors(
    request,
    env,
    { success: true, memories: rows.results || [], source: 'd1' },
    200
  )
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: false, error: 'Sign in to save memories.' }, 401)
  }
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'QUOTA_STORE_UNAVAILABLE', error: 'Storage unavailable.' },
      503
    )
  }
  let body: { content?: string; memoryType?: string; source?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const content = (body.content || '').trim().slice(0, 2000)
  if (!content) {
    return jsonWithCors(request, env, { success: false, error: 'Content required.' }, 400)
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB
    .prepare(
      `INSERT INTO user_memories (id, user_id, content, memory_type, source, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      idRes.identity.userId,
      content,
      (body.memoryType || 'note').slice(0, 40),
      body.source || null,
      now,
      now
    )
    .run()
  return jsonWithCors(request, env, { success: true, id }, 201)
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: false, error: 'Sign in required.' }, 401)
  }
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'QUOTA_STORE_UNAVAILABLE', error: 'Storage unavailable.' },
      503
    )
  }
  const url = new URL(request.url)
  const id = (url.searchParams.get('id') || '').trim()
  if (!id) return jsonWithCors(request, env, { success: false, error: 'Missing id.' }, 400)
  const result = await env.DB.prepare(
    `DELETE FROM user_memories WHERE id = ? AND user_id = ?`
  )
    .bind(id, idRes.identity.userId)
    .run()
  if (!result.meta || (result.meta as { changes?: number }).changes === 0) {
    return jsonWithCors(request, env, { success: false, error: 'Not found.' }, 404)
  }
  return jsonWithCors(request, env, { success: true }, 200)
}
