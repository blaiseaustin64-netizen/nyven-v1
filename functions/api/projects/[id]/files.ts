import { optionsResponse, jsonWithCors } from '../../../_shared/cors'
import type { D1Database } from '../../../_shared/db/types'
import { resolveSessionUser } from '../../../_shared/auth/service'
import { assertProjectOwner, ensureProjectsSchema } from '../../../_shared/projects/service'
import { ATTACHMENT_LIMITS, kindForMime, resolveMime } from '../../../_shared/attachmentLimits'
import { processFileBytes } from '../../../_shared/attachmentProcess'

interface Env {
  DB?: D1Database
  PROJECT_FILES?: R2Bucket
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>
  delete(key: string): Promise<void>
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, POST, DELETE, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  await ensureProjectsSchema(env.DB)
  if (!(await assertProjectOwner(env.DB, projectId, user.id))) {
    return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  }
  try {
    let rows
    try {
      rows = await env.DB
        .prepare(
          `SELECT id, name, mime_type, size_bytes, kind, created_at, storage_key, r2_key
           FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC`
        )
        .bind(projectId, user.id)
        .all()
    } catch {
      rows = await env.DB
        .prepare(
          `SELECT id, name, mime_type, size_bytes, created_at, storage_key, metadata_json
           FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC`
        )
        .bind(projectId, user.id)
        .all()
    }
    const files = (rows.results || []).map((r: any) => {
      let kind = r.kind || 'document'
      if (!r.kind && r.metadata_json) {
        try {
          const m = JSON.parse(r.metadata_json)
          if (m.kind) kind = m.kind
        } catch { /* */ }
      }
      return {
        id: r.id,
        name: r.name,
        mimeType: r.mime_type,
        size: Number(r.size_bytes || 0),
        kind,
        createdAt: r.created_at,
        stored: Boolean(r.r2_key || r.storage_key),
      }
    })
    return jsonWithCors(request, env, {
      success: true,
      files,
      durableStorage: Boolean(env.PROJECT_FILES),
    })
  } catch (e) {
    console.error('list project files', e instanceof Error ? e.message : e)
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        error: 'Could not list project files.',
        files: [],
        durableStorage: Boolean(env.PROJECT_FILES),
      },
      500
    )
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  await ensureProjectsSchema(env.DB)
  if (!(await assertProjectOwner(env.DB, projectId, user.id))) {
    return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid form data' }, 400)
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return jsonWithCors(request, env, { success: false, error: 'File is required' }, 400)
  }
  const mime = resolveMime(file.name, file.type) || file.type
  if (!mime) {
    return jsonWithCors(request, env, { success: false, error: 'This file type is not supported.' }, 400)
  }
  if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
    return jsonWithCors(request, env, { success: false, error: 'File is too large.' }, 400)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const clientExtracted = String(form.get('extractedText') || '').slice(0, ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS)
  const clientStatus = String(form.get('status') || '').slice(0, 120)
  const buffer = await file.arrayBuffer()
  const processed = processFileBytes(file.name, file.type, buffer)
  const kind =
    processed.ok ? processed.attachment.kind : kindForMime(mime)
  let extractedText =
    clientExtracted ||
    (processed.ok ? processed.attachment.extractedText || '' : '')
  let r2Key: string | null = null

  // Fallback plain text read when processor returned nothing
  if (!extractedText && (kind === 'text' || mime.startsWith('text/') || mime === 'application/json')) {
    try {
      extractedText = new TextDecoder('utf-8', { fatal: false })
        .decode(new Uint8Array(buffer))
        .slice(0, ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS)
    } catch {
      /* */
    }
  }

  if (env.PROJECT_FILES) {
    try {
      r2Key = `projects/${user.id}/${projectId}/${id}/${file.name}`
      await env.PROJECT_FILES.put(r2Key, buffer, {
        httpMetadata: { contentType: mime },
      })
    } catch (e) {
      console.error('r2 put failed', e instanceof Error ? e.message : e)
      r2Key = null
    }
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO project_files (id, project_id, user_id, name, mime_type, size_bytes, storage_key, metadata_json, created_at, extracted_text, kind, r2_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)`
      )
      .bind(
        id,
        projectId,
        user.id,
        file.name.slice(0, 240),
        mime,
        file.size,
        r2Key,
        now,
        extractedText,
        kind,
        r2Key
      )
      .run()
  } catch {
    // older schema without extra columns
    try {
      await env.DB
        .prepare(
          `INSERT INTO project_files (id, project_id, user_id, name, mime_type, size_bytes, storage_key, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          projectId,
          user.id,
          file.name.slice(0, 240),
          mime,
          file.size,
          r2Key,
          JSON.stringify({ extractedText, kind }),
          now
        )
        .run()
    } catch (e) {
      console.error('insert project file', e instanceof Error ? e.message : e)
      return jsonWithCors(request, env, { success: false, error: 'Could not save file.' }, 500)
    }
  }

  return jsonWithCors(
    request,
    env,
    {
      success: true,
      file: {
        id,
        name: file.name,
        mimeType: mime,
        size: file.size,
        kind,
        createdAt: now,
        stored: Boolean(r2Key),
      },
      durableStorage: Boolean(env.PROJECT_FILES),
      note: env.PROJECT_FILES
        ? undefined
        : 'File text was saved. Original binary storage is not configured yet.',
    },
    201
  )
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonWithCors(request, env, { success: false, error: 'Database unavailable' }, 503)
  const user = await resolveSessionUser(env, request)
  if (!user) return jsonWithCors(request, env, { success: false, code: 'UNAUTHORIZED', error: 'Sign in required' }, 401)
  const projectId = String(params.id || '')
  const url = new URL(request.url)
  const fileId = url.searchParams.get('fileId') || ''
  if (!fileId) return jsonWithCors(request, env, { success: false, error: 'fileId required' }, 400)
  if (!(await assertProjectOwner(env.DB, projectId, user.id))) {
    return jsonWithCors(request, env, { success: false, code: 'NOT_FOUND', error: 'Project not found' }, 404)
  }
  try {
    const row = await env.DB
      .prepare(`SELECT r2_key, storage_key FROM project_files WHERE id = ? AND project_id = ? AND user_id = ?`)
      .bind(fileId, projectId, user.id)
      .first<{ r2_key?: string; storage_key?: string }>()
    const key = row?.r2_key || row?.storage_key
    if (key && env.PROJECT_FILES) {
      try {
        await env.PROJECT_FILES.delete(key)
      } catch {
        /* */
      }
    }
    await env.DB
      .prepare(`DELETE FROM project_files WHERE id = ? AND project_id = ? AND user_id = ?`)
      .bind(fileId, projectId, user.id)
      .run()
  } catch (e) {
    console.error('delete project file', e instanceof Error ? e.message : e)
  }
  return jsonWithCors(request, env, { success: true })
}
