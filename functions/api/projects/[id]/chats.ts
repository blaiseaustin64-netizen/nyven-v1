import { optionsResponse, jsonWithCors } from '../../../_shared/cors'
import type { D1Database } from '../../../_shared/db/types'
import { resolveSessionUser } from '../../../_shared/auth/service'
import { createProjectChat, listProjectChats } from '../../../_shared/projects/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  const chats = await listProjectChats(env.DB, user.id, projectId)
  if (chats === null) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  return jsonWithCors(request, env, { success: true, chats })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  let body: { title?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* optional body */
  }
  const chat = await createProjectChat(env.DB, user.id, projectId, body.title)
  if (!chat) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  return jsonWithCors(request, env, { success: true, chat }, 201)
}
