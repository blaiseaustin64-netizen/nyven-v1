/**
 * POST /api/attachments
 * Validate + process a single file upload. Returns model-ready payload (ephemeral).
 * No persistent object storage (R2 not configured) — client holds content until send.
 */

import { ATTACHMENT_LIMITS } from '../_shared/attachmentLimits'
import { processFileBytes } from '../_shared/attachmentProcess'

interface Env {
  GEMINI_API_KEY?: string
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  jsonResponse({}, 204)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const contentType = context.request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse(
        {
          success: false,
          code: 'INVALID_REQUEST',
          error: 'Expected multipart form upload.',
        },
        400
      )
    }

    const form = await context.request.formData()
    const file = form.get('file')

    if (!file || typeof file === 'string') {
      return jsonResponse(
        { success: false, code: 'INVALID_REQUEST', error: 'No file provided.' },
        400
      )
    }

    const blob = file as File
    const filename = blob.name || 'file'
    const size = blob.size

    if (size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
      return jsonResponse(
        {
          success: false,
          code: 'FILE_TOO_LARGE',
          error: `Each file must be under ${Math.round(ATTACHMENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024))} MB.`,
        },
        400
      )
    }

    const buffer = await blob.arrayBuffer()
    const result = processFileBytes(filename, blob.type, buffer)

    if (!result.ok) {
      return jsonResponse(
        { success: false, code: result.code, error: result.message },
        400
      )
    }

    return jsonResponse(
      {
        success: true,
        attachment: {
          ...result.attachment,
          status: 'ready',
        },
      },
      200
    )
  } catch (err) {
    console.error('NYVEN /api/attachments error:', err)
    return jsonResponse(
      {
        success: false,
        code: 'PROCESS_FAILED',
        error: 'Could not process that file. Please try again.',
      },
      500
    )
  }
}
