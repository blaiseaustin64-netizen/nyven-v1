import { optionsResponse, jsonWithCors } from '../../../../_shared/cors'
import type { D1Database } from '../../../../_shared/db/types'
import { resolveSessionUser } from '../../../../_shared/auth/service'
import { assertProjectOwner, ensureProjectsSchema } from '../../../../_shared/projects/service'
import { ATTACHMENT_LIMITS } from '../../../../_shared/attachmentLimits'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'PUT, OPTIONS')

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  const fileId = String(params.fileId || '')
  await ensureProjectsSchema(env.DB)
  if (!(await assertProjectOwner(env.DB, projectId, user.id))) {
    return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  }
  let body: { extractedText?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const extractedText = String(body.extractedText || '').slice(0, ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS)
  try {
    await env.DB
      .prepare(
        `UPDATE project_files SET extracted_text = COALESCE(?, extracted_text), metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.extractedText', ?)
         WHERE id = ? AND project_id = ? AND user_id = ?`
      )
      .bind(extractedText, extractedText, fileId, projectId, user.id)
      .run()
  } catch {
    try {
      await env.DB
        .prepare(
          `UPDATE project_files SET metadata_json = ? WHERE id = ? AND project_id = ? AND user_id = ?`
        )
        .bind(JSON.stringify({ extractedText }), fileId, projectId, user.id)
        .run()
    } catch (e) {
      console.error('update file text', e instanceof Error ? e.message : e)
      return jsonWithCors(request, env, { success: false, error: 'Could not save file text.' }, 500)
    }
  }
  return jsonWithCors(request, env, { success: true })
}
