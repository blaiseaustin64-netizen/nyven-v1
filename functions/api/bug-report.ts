/**
 * POST /api/bug-report — persist to D1 + notify support email.
 */

import { resolveIdentity } from '../_shared/auth'
import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../_shared/db/guestKey'
import { checkBurst } from '../_shared/db/usage'
import { sendEmail, feedbackDestination, type EmailEnv } from '../_shared/email/brevo'
import { bugNotifyEmail } from '../_shared/email/templates'

interface Env extends EmailEnv {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  SUPPORT_INBOX?: string
}

export const onRequestOptions: PagesFunction<Env> = async (context) =>
  optionsResponse(context.request, context.env, 'POST, OPTIONS')

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
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  const summary = (body.summary || '').trim()
  if (summary.length < 5) {
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        error: 'Please describe what went wrong (at least a few words).',
      },
      400
    )
  }

  let userId: string | null = null
  try {
    const result = await resolveIdentity(request, env)
    if (result.ok && result.identity.authenticated) {
      userId = result.identity.userId
    }
  } catch {
    /* guest ok */
  }

  const usageSubject = await resolveUsageSubject(request, userId || undefined)
  const guestKey =
    usageSubject.subject.type === 'guest' ? usageSubject.subject.id : null

  const burstOk = await checkBurst(
    env.DB,
    `bug:${usageSubject.subject.type}:${usageSubject.subject.id}`,
    5
  )
  if (!burstOk.ok) {
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: burstOk.code,
        error: burstOk.message,
      },
      burstOk.httpStatus
    )
  }

  const reportId = crypto.randomUUID()
  const category = (body.category || 'general').slice(0, 40)
  const details = (body.details || '').slice(0, 4000)
  const route = (body.route || '').slice(0, 200)
  const conversationId = (body.conversationId || '').slice(0, 80) || null
  const messageId = (body.messageId || '').slice(0, 80) || null
  const userAgent = (body.userAgent || '').slice(0, 300)
  const clientVersion = (body.clientVersion || '').slice(0, 40)
  const createdAt = new Date().toISOString()

  let emailStatus = 'pending'

  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: 'QUOTA_STORE_UNAVAILABLE',
        error: 'Bug report service is temporarily unavailable. Please try again shortly.',
      },
      503
    )
  }

  {
    try {
      await env.DB.prepare(
        `INSERT INTO bug_reports (
          id, summary, category, details, route, conversation_id, message_id,
          user_id, guest_key, user_agent, client_version, email_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          reportId,
          summary.slice(0, 500),
          category,
          details,
          route,
          conversationId,
          messageId,
          userId,
          guestKey,
          userAgent,
          clientVersion,
          emailStatus,
          createdAt
        )
        .run()
    } catch {
      console.error(JSON.stringify({ level: 'error', msg: 'bug_report_d1_failed' }))
      return jsonWithCors(
        request,
        env,
        { success: false, error: 'Could not save bug report. Please try again.' },
        500
      )
    }
  }

  const mail = bugNotifyEmail({
    reportId,
    summary: summary.slice(0, 500),
    category,
    details,
    route,
    userId,
  })
  const emailResult = await sendEmail(env, {
    to: feedbackDestination(env),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    kind: 'bug_notify',
    relatedId: reportId,
  })

  emailStatus = emailResult.ok
    ? emailResult.mode === 'mock'
      ? 'mock'
      : 'sent'
    : 'failed'

  if (env.DB) {
    try {
      await env.DB.prepare(`UPDATE bug_reports SET email_status = ? WHERE id = ?`)
        .bind(emailStatus, reportId)
        .run()
    } catch {
      /* non-fatal */
    }
  }

  const res = jsonWithCors(
    request,
    env,
    {
      success: true,
      reportId,
      message: 'Bug report submitted. Thanks for helping us improve NYVEN.',
      emailDelivery: emailStatus,
    },
    200
  )
  if (usageSubject.setCookie && usageSubject.cookieValue) {
    const h = new Headers(res.headers)
    h.append(
      'Set-Cookie',
      guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
    )
    return new Response(res.body, { status: 200, headers: h })
  }
  return res
}
