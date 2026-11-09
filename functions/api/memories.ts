import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveIdentity, type AuthEnv } from '../_shared/auth'
import {
  ensureMemorySchema,
  extractFactsHeuristic,
  isSensitiveOrForbidden,
  listMemoriesForUser,
  normalizeFact,
  patchMemory,
  upsertMemory,
} from '../_shared/memory/service'

interface Env extends AuthEnv {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, PATCH, DELETE, OPTIONS')

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
  await ensureMemorySchema(env.DB)
  const url = new URL(request.url)
  const all = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true'
  const projectId = url.searchParams.get('projectId')
  const rows = await listMemoriesForUser(env.DB, idRes.identity.userId, {
    all,
    projectId,
    limit: 200,
  })
  return jsonWithCors(
    request,
    env,
    {
      success: true,
      memories: rows.map((r) => ({
        id: r.id,
        content: r.content,
        memory_type: r.memory_type,
        source: r.source,
        enabled: !!r.enabled,
        created_at: r.created_at,
        updated_at: r.updated_at,
        project_id: r.project_id ?? null,
        source_conversation_id: r.source_conversation_id ?? null,
        pinned: !!r.pinned,
      })),
      source: 'd1',
    },
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
  let body: {
    content?: string
    memoryType?: string
    source?: string
    projectId?: string
    conversationId?: string
    /** Background extract from last exchange */
    extractFrom?: { user?: string; assistant?: string }
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  // Auto-extraction path
  if (body.extractFrom?.user) {
    const facts = extractFactsHeuristic(body.extractFrom.user, body.extractFrom.assistant || '')
    const saved: string[] = []
    for (const f of facts) {
      const r = await upsertMemory(env.DB, idRes.identity.userId, f, {
        source: 'auto',
        projectId: body.projectId,
        conversationId: body.conversationId,
      })
      if (r) saved.push(r.id)
    }
    return jsonWithCors(request, env, { success: true, ids: saved, count: saved.length }, 200)
  }

  const content = normalizeFact(body.content || '')
  if (!content) {
    return jsonWithCors(request, env, { success: false, error: 'Content required.' }, 400)
  }
  if (isSensitiveOrForbidden(content)) {
    return jsonWithCors(request, env, { success: false, error: 'That content cannot be saved.' }, 400)
  }
  const r = await upsertMemory(env.DB, idRes.identity.userId, content, {
    memoryType: body.memoryType,
    source: body.source,
    projectId: body.projectId,
    conversationId: body.conversationId,
  })
  if (!r) return jsonWithCors(request, env, { success: false, error: 'Could not save memory.' }, 400)
  return jsonWithCors(request, env, { success: true, id: r.id, merged: r.merged }, 201)
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: false, error: 'Sign in required.' }, 401)
  }
  if (!env.DB) {
    return jsonWithCors(request, env, { success: false, error: 'Storage unavailable.' }, 503)
  }
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) return jsonWithCors(request, env, { success: false, error: 'id required' }, 400)
  let body: { enabled?: boolean; content?: string; pinned?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const ok = await patchMemory(env.DB, idRes.identity.userId, id, body)
  if (!ok) return jsonWithCors(request, env, { success: false, error: 'Update failed.' }, 400)
  return jsonWithCors(request, env, { success: true }, 200)
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: false, error: 'Sign in required.' }, 401)
  }
  if (!env.DB) {
    return jsonWithCors(request, env, { success: false, error: 'Storage unavailable.' }, 503)
  }
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const clearAll = url.searchParams.get('all') === '1'
  if (clearAll) {
    await env.DB.prepare(`DELETE FROM user_memories WHERE user_id = ?`).bind(idRes.identity.userId).run()
    return jsonWithCors(request, env, { success: true }, 200)
  }
  if (!id) return jsonWithCors(request, env, { success: false, error: 'id required' }, 400)
  await env.DB
    .prepare(`DELETE FROM user_memories WHERE id = ? AND user_id = ?`)
    .bind(id, idRes.identity.userId)
    .run()
  return jsonWithCors(request, env, { success: true }, 200)
}
