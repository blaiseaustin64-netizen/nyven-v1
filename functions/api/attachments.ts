/**
 * POST /api/attachments
 * Validate + process a single file upload. Returns model-ready payload (ephemeral).
 * Rate-limited via D1 burst buckets when DB is bound; CORS via shared helper.
 */

import { ATTACHMENT_LIMITS } from '../_shared/attachmentLimits'
import { processFileBytes } from '../_shared/attachmentProcess'
import { resolveIdentity } from '../_shared/auth'
import { corsHeaders, optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveUsageSubject } from '../_shared/db/guestKey'
import { checkBurst } from '../_shared/db/usage'

interface Env {
  GEMINI_API_KEY?: string
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SESSION_SECRET?: string
  JWT_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (context) =>
  optionsResponse(context.request, context.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  try {
    const identityResult = await resolveIdentity(request, env, request.signal)
    if (!identityResult.ok && identityResult.code === 'AUTH_INVALID') {
      return jsonWithCors(
        request,
        env,
        { success: false, code: identityResult.code, error: identityResult.message },
        401,
        'POST, OPTIONS'
      )
    }
    if (!identityResult.ok && identityResult.code === 'AUTH_CONFIG') {
      return jsonWithCors(
        request,
        env,
        { success: false, code: identityResult.code, error: identityResult.message },
        503,
        'POST, OPTIONS'
      )
    }

    const userId =
      identityResult.ok && identityResult.identity.authenticated
        ? identityResult.identity.userId
        : undefined
    const usageSubject = await resolveUsageSubject(request, userId)
    const subject = usageSubject.subject
    const burstOk = await checkBurst(env.DB, `attachments:${subject.type}:${subject.id}`)
    if (!burstOk.ok) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: burstOk.code, error: burstOk.message },
        burstOk.httpStatus,
        'POST, OPTIONS'
      )
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'INVALID_REQUEST',
          error: 'Expected multipart form upload.',
        },
        400,
        'POST, OPTIONS'
      )
    }

    const form = await request.formData()
    const file = form.get('file')

    if (!file || typeof file === 'string') {
      return jsonWithCors(
        request,
        env,
        { success: false, code: 'INVALID_REQUEST', error: 'No file provided.' },
        400,
        'POST, OPTIONS'
      )
    }

    const blob = file as File
    const filename = blob.name || 'file'
    const size = blob.size

    if (size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'FILE_TOO_LARGE',
          error: `Each file must be under ${Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024))} MB.`,
        },
        400,
        'POST, OPTIONS'
      )
    }

    const buffer = await blob.arrayBuffer()
    const result = processFileBytes(filename, blob.type, buffer)

    if (!result.ok) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: result.code, error: result.message },
        400,
        'POST, OPTIONS'
      )
    }

    return jsonWithCors(
      request,
      env,
      {
        success: true,
        attachment: {
          ...result.attachment,
          status: 'ready',
        },
      },
      200,
      'POST, OPTIONS'
    )
  } catch (err) {
    console.error('[attachments]', err instanceof Error ? err.message : 'error')
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'INTERNAL', error: 'Could not process attachment.' },
      500,
      'POST, OPTIONS'
    )
  }
}
