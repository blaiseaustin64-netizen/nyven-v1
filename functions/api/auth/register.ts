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

  // Email is best-effort — never fail signup after the user row is created
  let emailDelivery: string = 'mock'
  try {
    const mail = verificationEmail({
      code: result.verifyCode,
      expiresMinutes: 5,
      purpose: 'verify_email',
    })
    const delivery = await sendEmail(env, {
      to: result.user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      kind: 'verify_email',
      relatedId: result.user.id,
    })
    emailDelivery = delivery.ok ? delivery.mode : 'failed'
  } catch (e) {
    console.error('register email error', e instanceof Error ? e.name : 'unknown')
    emailDelivery = 'failed'
  }

  return jsonWithCors(
    request,
    env,
    {
      success: true,
      requiresVerification: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        emailVerified: false,
      },
      message:
        emailDelivery === 'sent'
          ? 'Account created. Check your email for the six-digit verification code. It expires in 5 minutes.'
          : 'Account created. Enter the verification code from your email (or use Resend code). Code expires in 5 minutes.',
      emailDelivery,
    },
    201
  )
}
