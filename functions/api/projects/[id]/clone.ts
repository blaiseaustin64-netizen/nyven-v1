import { optionsResponse, jsonWithCors } from '../../../_shared/cors'
import type { D1Database } from '../../../_shared/db/types'
import { resolveSessionUser } from '../../../_shared/auth/service'
import {
  assertProjectOwner,
  createProject,
  ensureProjectsSchema,
  listTasks,
  upsertTask,
} from '../../../_shared/projects/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const id = String(params.id || '')
  await ensureProjectsSchema(env.DB)
  const row = await assertProjectOwner(env.DB, id, user.id)
  if (!row) return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)

  let description = ''
  let instructions = ''
  try {
    description = (row as any).description || ''
    instructions = (row as any).instructions || ''
    if (!description && row.data_json) {
      const d = JSON.parse(row.data_json)
      description = d.description || ''
      instructions = instructions || d.instructions || ''
    }
  } catch {
    /* */
  }

  const copy = await createProject(env.DB, user.id, {
    name: `${row.title} (copy)`,
    description,
    instructions,
  })
  if (!copy) return jsonWithCors(request, env, { success: false, error: 'Could not clone project' }, 500)

  const tasks = await listTasks(env.DB, user.id, id)
  if (tasks) {
    for (const tk of tasks) {
      await upsertTask(env.DB, user.id, copy.id, {
        title: tk.title,
        description: tk.description,
        status: tk.status,
        priority: tk.priority,
      })
    }
  }

  try {
    const files = await env.DB
      .prepare(
        `SELECT name, mime_type, size_bytes, extracted_text, metadata_json, kind FROM project_files WHERE project_id = ? AND user_id = ?`
      )
      .bind(id, user.id)
      .all()
    for (const f of files.results || []) {
      const fid = crypto.randomUUID()
      const now = new Date().toISOString()
      try {
        await env.DB
          .prepare(
            `INSERT INTO project_files (id, project_id, user_id, name, mime_type, size_bytes, storage_key, metadata_json, created_at, extracted_text, kind)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
          )
          .bind(
            fid,
            copy.id,
            user.id,
            (f as any).name,
            (f as any).mime_type,
            (f as any).size_bytes || 0,
            (f as any).metadata_json || '{}',
            now,
            (f as any).extracted_text || '',
            (f as any).kind || 'document'
          )
          .run()
      } catch {
        await env.DB
          .prepare(
            `INSERT INTO project_files (id, project_id, user_id, name, mime_type, size_bytes, storage_key, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
          )
          .bind(
            fid,
            copy.id,
            user.id,
            (f as any).name,
            (f as any).mime_type,
            (f as any).size_bytes || 0,
            (f as any).metadata_json || '{}',
            now
          )
          .run()
      }
    }
  } catch (e) {
    console.error('clone files', e instanceof Error ? e.message : e)
  }

  return jsonWithCors(request, env, { success: true, project: copy }, 201)
}
