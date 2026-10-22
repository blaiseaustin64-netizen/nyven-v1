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
  try {
    let body: { email?: string; password?: string; displayName?: string }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
    }

    if (!env.DB) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'QUOTA_STORE_UNAVAILABLE',
          error: 'D1 binding DB is missing. Bind nyven-db as DB and redeploy.',
        },
        503
      )
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

    // Email is best-effort — never fail signup if mail fails
    let emailDelivery: string = 'skipped'
    try {
      const mail = verificationEmail({
        code: result.verifyToken.slice(0, 8),
        expiresMinutes: 24 * 60,
        purpose: 'verify_email',
      })
      const appUrl = (env.APP_URL || '').replace(/\/$/, '')
      const verifyUrl = appUrl
        ? `${appUrl}/auth?verify=${encodeURIComponent(result.verifyToken)}`
        : ''
      const sendResult = await sendEmail(env, {
        to: result.user.email,
        subject: mail.subject,
        html: mail.html + (verifyUrl ? `<p><a href="${verifyUrl}">Verify email</a></p>` : ''),
        text: mail.text + (verifyUrl ? `\n${verifyUrl}\n` : ''),
        kind: 'verify_email',
        relatedId: result.user.id,
      })
      emailDelivery = sendResult.ok ? sendResult.mode : 'failed'
    } catch (e) {
      console.error('register email error', e instanceof Error ? e.name : 'unknown')
      emailDelivery = 'failed'
    }

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
          emailDelivery === 'sent'
            ? 'Account created. Check your email to verify, then sign in.'
            : 'Account created. You can sign in now. (Verification email was not sent — configure BREVO later.)',
        emailDelivery,
      },
      201
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('register route error', msg.slice(0, 200))
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: 'REGISTER_EXCEPTION',
        error: `Could not create account: ${msg.slice(0, 160)}`,
      },
      500
    )
  }
}
