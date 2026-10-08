/**
 * POST /api/feedback — message feedback (thumbs up/down).
 * Does not email from the browser. Ready for Supabase persistence later.
 */

interface Env {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request } = context

  let body: {
    feedbackType?: string
    conversationId?: string
    messageId?: string
    reason?: string
    details?: string
    clientVersion?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400)
  }

  const feedbackType = body.feedbackType
  if (feedbackType !== 'positive' && feedbackType !== 'negative') {
    return json({ success: false, error: 'feedbackType must be positive or negative' }, 400)
  }

  // Optional identity — verify only if Bearer present (reuse auth helper)
  let userId: string | undefined
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { resolveIdentity } = await import('../_shared/auth')
      const result = await resolveIdentity(request, context.env)
      if (result.ok && result.identity.authenticated) {
        userId = result.identity.userId
      }
    } catch {
      /* guest feedback still accepted */
    }
  }

  const feedbackId = crypto.randomUUID()
  const record = {
    id: feedbackId,
    feedbackType,
    conversationId: typeof body.conversationId === 'string' ? body.conversationId.slice(0, 80) : null,
    messageId: typeof body.messageId === 'string' ? body.messageId.slice(0, 80) : null,
    userId: userId || null,
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
    details: typeof body.details === 'string' ? body.details.slice(0, 2000) : null,
    clientVersion: typeof body.clientVersion === 'string' ? body.clientVersion.slice(0, 40) : null,
    createdAt: new Date().toISOString(),
  }

  // Persist when Supabase is configured (service not required for anon insert if RLS allows;
  // for now log structured event — table migration optional)
  console.log('[nyven-feedback]', JSON.stringify({
    id: record.id,
    type: record.feedbackType,
    conversationId: record.conversationId,
    messageId: record.messageId,
    userId: record.userId ? '[set]' : null,
    // never log reason full body with secrets — reason is user text only
  }))

  return json({
    success: true,
    feedbackId,
    message: 'Thanks for your feedback.',
  })
}
