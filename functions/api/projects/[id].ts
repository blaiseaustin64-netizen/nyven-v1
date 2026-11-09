import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'
import {
  assertProjectOwner,
  deleteProject,
  listActivity,
  listProjectChats,
  listTasks,
  toPublicProject,
  updateProject,
} from '../../_shared/projects/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, PUT, PATCH, DELETE, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  const row = await assertProjectOwner(env.DB, id, user.id)
  if (!row) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  const [chats, tasks, activity] = await Promise.all([
    listProjectChats(env.DB, user.id, id),
    listTasks(env.DB, user.id, id),
    listActivity(env.DB, user.id, id, 20),
  ])
  return jsonWithCors(request, env, {
    success: true,
    project: toPublicProject(row, {
      chatCount: chats?.length || 0,
      taskCount: tasks?.length || 0,
    }),
    chats: chats || [],
    tasks: tasks || [],
    activity: activity || [],
  })
}

export const onRequestPut: PagesFunction<Env> = async (ctx) => onRequestPatch(ctx)
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  let body: {
    name?: string
    description?: string
    instructions?: string
    status?: string
    archive?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  try {
    const project = await updateProject(env.DB, user.id, id, body)
    if (!project) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
    return jsonWithCors(request, env, { success: true, project })
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Could not update project' }, 500)
  }
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  const ok = await deleteProject(env.DB, user.id, id)
  if (!ok) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  return jsonWithCors(request, env, { success: true })
}
