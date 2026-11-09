import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'
import {
  createProject,
  ensureProjectsSchema,
  listProjectsForUser,
} from '../../_shared/projects/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  try {
    await ensureProjectsSchema(env.DB)
    const projects = await listProjectsForUser(env.DB, user.id)
    return jsonWithCors(request, env, { success: true, projects })
  } catch (e) {
    console.error('list projects', e instanceof Error ? e.message : e)
    return jsonWithCors(request, env, { success: false, error: 'Could not list projects' }, 500)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  }
  const user = await resolveSessionUser(env, request)
  if (!user) {
    return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  }
  let body: { name?: string; description?: string; instructions?: string }
  try {
    body = await request.json()
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const name = (body.name || '').trim()
  if (!name) {
    return jsonWithCors(request, env, { success: false, error: 'Project name is required' }, 400)
  }
  try {
    await ensureProjectsSchema(env.DB)
    const project = await createProject(env.DB, user.id, {
      name,
      description: body.description,
      instructions: body.instructions,
    })
    if (!project) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          error: 'Could not create project. Please try again.',
        },
        500
      )
    }
    return jsonWithCors(request, env, { success: true, project }, 201)
  } catch (e) {
    console.error('create project', e instanceof Error ? e.message : e)
    return jsonWithCors(
      request,
      env,
      { success: false, error: 'Could not create project. Please try again.' },
      500
    )
  }
}
