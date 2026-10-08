/**
 * POST /api/bug-report
 * Accepts bug reports from the NYVEN UI.
 * Future: deliver to hellovexdyn@gmail.com via server-side mail provider.
 * Does NOT open mailto or expose email credentials.
 */

interface Env {
  // Future: RESEND_API_KEY, SENDGRID_API_KEY, etc.
  SUPPORT_INBOX?: string
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
  const { request, env } = context

  let body: {
    summary?: string
    category?: string
    details?: string
    route?: string
    conversationId?: string
    messageId?: string
    userAgent?: string
    clientVersion?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400)
  }

  const summary = (body.summary || '').trim()
  if (summary.length < 5) {
    return json({ success: false, error: 'Please describe what went wrong (at least a few words).' }, 400)
  }

  let userId: string | null = null
  try {
    const { resolveIdentity } = await import('../_shared/auth')
    const result = await resolveIdentity(request, context.env as never)
    if (result.ok && result.identity.authenticated) {
      userId = result.identity.userId
    }
  } catch {
    /* guest ok */
  }

  const reportId = crypto.randomUUID()
  const destination = env.SUPPORT_INBOX || 'hellovexdyn@gmail.com'

  const report = {
    id: reportId,
    summary: summary.slice(0, 500),
    category: (body.category || 'general').slice(0, 40),
    details: (body.details || '').slice(0, 4000),
    route: (body.route || '').slice(0, 200),
    conversationId: (body.conversationId || '').slice(0, 80) || null,
    messageId: (body.messageId || '').slice(0, 80) || null,
    userAgent: (body.userAgent || '').slice(0, 300),
    clientVersion: (body.clientVersion || '').slice(0, 40),
    userId,
    destination,
    createdAt: new Date().toISOString(),
    emailDelivery: 'pending' as const,
  }

  // Structured log for operators; email provider not configured yet
  console.log('[nyven-bug-report]', JSON.stringify({
    id: report.id,
    category: report.category,
    route: report.route,
    userId: userId ? '[set]' : null,
    destination: report.destination,
    emailDelivery: report.emailDelivery,
  }))

  return json({
    success: true,
    reportId,
    message: 'Bug report submitted. Thanks for helping us improve NYVEN.',
    emailDelivery: 'pending',
  })
}
