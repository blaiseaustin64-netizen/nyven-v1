import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { registerUser } from '../../_shared/auth/service'
import { checkBurst } from '../../_shared/db/usage'
import { sendEmail, type EmailEnv } from '../../_shared/email/brevo'
import { verificationEmail } from '../../_shared/email/templates'
import { clientIp } from '../../_shared/db/guestKey'

interface Env extends EmailEnv {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { email?: string; password?: string; displayName?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  const burst = await checkBurst(env.DB, `auth-register:${clientIp(request)}`, 5, 3600_000)
  if (!burst.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: burst.code, error: burst.message },
      burst.httpStatus
    )
  }

  const result = await registerUser(env, {
    email: body.email || '',
    password: body.password || '',
    displayName: body.displayName,
  })

  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: result.code, error: result.message },
      result.httpStatus
    )
  }

  // Send verification email (mock if no Brevo key) — never return raw token to client in production responses
  const mail = verificationEmail({
    code: result.verifyToken.slice(0, 8), // short display; full token in link
    expiresMinutes: 24 * 60,
    purpose: 'verify_email',
  })
  const appUrl = (env.APP_URL || '').replace(/\/$/, '')
  const verifyUrl = appUrl
    ? `${appUrl}/auth?verify=${encodeURIComponent(result.verifyToken)}`
    : ''
  const textExtra = verifyUrl ? `\n\nOpen this link to verify:\n${verifyUrl}\n` : ''
  await sendEmail(env, {
    to: result.user.email,
    subject: mail.subject,
    html: mail.html + (verifyUrl ? `<p><a href="${verifyUrl}">Verify email</a></p>` : ''),
    text: mail.text + textExtra,
    kind: 'verify_email',
    relatedId: result.user.id,
  })

  return jsonWithCors(
    request,
    env,
    {
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        emailVerified: result.user.emailVerified,
      },
      message:
        'Account created. Check your email to verify your address, then sign in.',
      // Dev-only hint when Brevo missing — still not logging secrets in server logs of the code
      emailDelivery: env.BREVO_API_KEY ? 'attempted' : 'mock',
    },
    201
  )
}
