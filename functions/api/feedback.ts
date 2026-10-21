/**
 * POST /api/feedback — thumbs up/down.
 * Persists to D1 when bound; notifies support via Brevo (or mock).
 * Success message for UI: "Thank you for your feedback!"
 */

import { resolveIdentity } from '../_shared/auth'
import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../_shared/db/guestKey'
import { checkBurst } from '../_shared/db/usage'
import { sendEmail, feedbackDestination, type EmailEnv } from '../_shared/email/brevo'
import { feedbackNotifyEmail } from '../_shared/email/templates'

interface Env extends EmailEnv {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async (context) =>
  optionsResponse(context.request, context.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

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
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  const feedbackType = body.feedbackType
  if (feedbackType !== 'positive' && feedbackType !== 'negative') {
    return jsonWithCors(
      request,
      env,
      { success: false, error: 'feedbackType must be positive or negative' },
      400
    )
  }

  let userId: string | undefined
  const identityResult = await resolveIdentity(request, env)
  if (identityResult.ok && identityResult.identity.authenticated) {
    userId = identityResult.identity.userId
  }

  const usageSubject = await resolveUsageSubject(request, userId)
  const guestKey =
    usageSubject.subject.type === 'guest' ? usageSubject.subject.id : null

  const burstOk = await checkBurst(
    env.DB,
    `feedback:${usageSubject.subject.type}:${usageSubject.subject.id}`,
    20
  )
  if (!burstOk.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: burstOk.code, error: burstOk.message },
      burstOk.httpStatus
    )
  }

  const feedbackId = crypto.randomUUID()
  const messageId =
    typeof body.messageId === 'string' ? body.messageId.slice(0, 80) : null
  const conversationId =
    typeof body.conversationId === 'string' ? body.conversationId.slice(0, 80) : null
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null
  const details = typeof body.details === 'string' ? body.details.slice(0, 2000) : null
  const clientVersion =
    typeof body.clientVersion === 'string' ? body.clientVersion.slice(0, 40) : null
  const createdAt = new Date().toISOString()

  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: 'QUOTA_STORE_UNAVAILABLE',
        error: 'Feedback service is temporarily unavailable. Please try again shortly.',
      },
      503
    )
  }

  {
    try {
      await env.DB.prepare(
        `INSERT INTO feedback (
          id, feedback_type, conversation_id, message_id, user_id, guest_key,
          reason, details, client_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          feedbackId,
          feedbackType,
          conversationId,
          messageId,
          userId || null,
          guestKey,
          reason,
          details,
          clientVersion,
          createdAt
        )
        .run()
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message || e)
      if (msg.toLowerCase().includes('unique')) {
        return jsonWithCors(
          request,
          env,
          {
            success: true,
            feedbackId,
            message: 'Thank you for your feedback!',
            duplicate: true,
          },
          200
        )
      }
      console.error(JSON.stringify({ level: 'error', msg: 'feedback_d1_insert_failed' }))
      return jsonWithCors(
        request,
        env,
        { success: false, error: 'Could not save feedback. Please try again.' },
        500
      )
    }
  }

  const mail = feedbackNotifyEmail({
    feedbackType,
    feedbackId,
    conversationId,
    messageId,
    userId: userId || null,
    reason,
  })
  const emailResult = await sendEmail(env, {
    to: feedbackDestination(env),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    kind: 'feedback_notify',
    relatedId: feedbackId,
  })

  const res = jsonWithCors(
    request,
    env,
    {
      success: true,
      feedbackId,
      message: 'Thank you for your feedback!',
      emailDelivery: emailResult.ok
        ? emailResult.mode === 'mock'
          ? 'mock'
          : 'sent'
        : 'failed',
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
