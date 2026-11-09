import { optionsResponse, jsonWithCors } from '../../../_shared/cors'
import type { D1Database } from '../../../_shared/db/types'
import { resolveSessionUser } from '../../../_shared/auth/service'
import { listTasks, upsertTask } from '../../../_shared/projects/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, PUT, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  const tasks = await listTasks(env.DB, user.id, projectId)
  if (tasks === null) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  return jsonWithCors(request, env, { success: true, tasks })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  let body: { id?: string; title?: string; description?: string; status?: string; priority?: string }
  try {
    body = await request.json()
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  if (!body.title?.trim()) return jsonWithCors(request, env, { success: false, error: 'Title required' }, 400)
  const task = await upsertTask(env.DB, user.id, projectId, {
    id: body.id,
    title: body.title,
    description: body.description,
    status: body.status,
    priority: body.priority,
  })
  if (!task) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  return jsonWithCors(request, env, { success: true, task })
}

export const onRequestPut: PagesFunction<Env> = async (ctx) => onRequestPost(ctx)
