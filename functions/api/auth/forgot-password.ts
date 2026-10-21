import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { createPasswordResetToken } from '../../_shared/auth/service'
import { sendEmail, type EmailEnv } from '../../_shared/email/brevo'
import { passwordResetEmail } from '../../_shared/email/templates'

interface Env extends EmailEnv {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { email?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  const result = await createPasswordResetToken(env, body.email || '')
  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: result.code, error: result.message },
      result.httpStatus
    )
  }

  if (result.emitted && result.token) {
    const appUrl = (env.APP_URL || '').replace(/\/$/, '')
    const resetUrl = appUrl
      ? `${appUrl}/auth?reset=${encodeURIComponent(result.token)}`
      : ''
    if (resetUrl) {
      const mail = passwordResetEmail({ resetUrl, expiresMinutes: 60 })
      const to = (body.email || '').trim()
      if (to) {
        await sendEmail(env, {
          to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          kind: 'password_reset',
          relatedId: result.userId,
        })
      }
    } else {
      console.warn('password reset skipped: APP_URL not set')
    }
  }

  return jsonWithCors(
    request,
    env,
    {
      success: true,
      message: 'If an account exists for that email, reset instructions were sent.',
    },
    200
  )
}
