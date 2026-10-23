import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { checkBurst } from '../../_shared/db/usage'
import { clientIp } from '../../_shared/db/guestKey'
import { issueVerificationCode } from '../../_shared/auth/service'
import { sendEmail, type EmailEnv } from '../../_shared/email/brevo'
import { verificationEmail } from '../../_shared/email/templates'

interface Env extends EmailEnv { DB?: D1Database; ALLOWED_ORIGINS?: string }

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { email?: string }
  try { body = (await request.json()) as typeof body }
  catch { return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400) }

  const ipLimit = await checkBurst(env.DB, `auth-resend-ip:${clientIp(request)}`, 5, 60 * 60_000)
  if (!ipLimit.ok) return jsonWithCors(request, env, { success: false, code: ipLimit.code, error: ipLimit.message }, ipLimit.httpStatus)

  const email = (body.email || '').trim()
  const emailLimit = await checkBurst(env.DB, `auth-resend-email:${email.toLowerCase()}`, 3, 60 * 60_000)
  if (!emailLimit.ok) return jsonWithCors(request, env, { success: false, code: emailLimit.code, error: emailLimit.message }, emailLimit.httpStatus)

  const issued = await issueVerificationCode(env, email)
  if (!issued.ok) return jsonWithCors(request, env, { success: false, code: issued.code, error: issued.message }, issued.httpStatus)
  if (issued.emitted) {
    const mail = verificationEmail({ code: issued.code, expiresMinutes: 5, purpose: 'verify_email' })
    await sendEmail(env, { to: email, subject: mail.subject, html: mail.html, text: mail.text, kind: 'verify_email', relatedId: issued.userId })
  }
  return jsonWithCors(request, env, { success: true, message: 'If this address has an unverified NYVEN account, a new code has been sent. Check your inbox.' }, 200)
}
