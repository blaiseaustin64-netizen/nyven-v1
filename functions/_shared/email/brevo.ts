/**
 * Brevo (Sendinblue) transactional email client.
 * When BREVO_API_KEY is missing, returns a clear not-configured result (no throw of secrets).
 * Never logs API keys or verification codes.
 */

import type { D1Database } from '../db/types'

export type EmailEnv = {
  BREVO_API_KEY?: string
  BREVO_FROM_NAME?: string
  BREVO_FROM_EMAIL?: string
  NYVEN_FEEDBACK_EMAIL?: string
  SUPPORT_INBOX?: string
  DB?: D1Database
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  kind: string
  relatedId?: string
}

export type SendEmailResult =
  | { ok: true; mode: 'sent' | 'mock'; messageId?: string; outboxId: string }
  | { ok: false; code: string; message: string; outboxId?: string }

function fromAddress(env: EmailEnv): { name: string; email: string } {
  return {
    name: env.BREVO_FROM_NAME || 'NYVEN Support',
    email: env.BREVO_FROM_EMAIL || 'hellovexdyn@gmail.com',
  }
}

export function feedbackDestination(env: EmailEnv): string {
  return env.NYVEN_FEEDBACK_EMAIL || env.SUPPORT_INBOX || 'hellovexdyn@gmail.com'
}

async function writeOutbox(
  db: D1Database | undefined,
  row: {
    id: string
    kind: string
    to_email: string
    subject: string
    status: string
    provider?: string
    provider_message_id?: string
    error?: string
    related_id?: string
  }
): Promise<void> {
  if (!db) return
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO email_outbox (id, kind, to_email, subject, status, provider, provider_message_id, error, related_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.kind,
      row.to_email,
      row.subject,
      row.status,
      row.provider || null,
      row.provider_message_id || null,
      row.error || null,
      row.related_id || null,
      now,
      now
    )
    .run()
}

/**
 * Send via Brevo REST API v3. Safe when key missing.
 */
export async function sendEmail(
  env: EmailEnv,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const outboxId = crypto.randomUUID()
  const from = fromAddress(env)
  const key = (env.BREVO_API_KEY || '').trim()

  if (!key) {
    await writeOutbox(env.DB, {
      id: outboxId,
      kind: input.kind,
      to_email: input.to,
      subject: input.subject,
      status: 'mock_no_key',
      provider: 'brevo',
      related_id: input.relatedId,
      error: 'BREVO_API_KEY not configured',
    })
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'email_mock',
        kind: input.kind,
        to: input.to.replace(/(.{2}).+(@.+)/, '$1***$2'),
        outboxId,
      })
    )
    return {
      ok: true,
      mode: 'mock',
      outboxId,
    }
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': key,
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const safe = errText.slice(0, 200).replace(/api[_-]?key/gi, '[redacted]')
      await writeOutbox(env.DB, {
        id: outboxId,
        kind: input.kind,
        to_email: input.to,
        subject: input.subject,
        status: 'failed',
        provider: 'brevo',
        related_id: input.relatedId,
        error: `HTTP ${res.status}: ${safe}`,
      })
      return {
        ok: false,
        code: 'EMAIL_PROVIDER_ERROR',
        message:
          'Email could not be sent. The message was saved and can be retried when delivery is available.',
        outboxId,
      }
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string }
    await writeOutbox(env.DB, {
      id: outboxId,
      kind: input.kind,
      to_email: input.to,
      subject: input.subject,
      status: 'sent',
      provider: 'brevo',
      provider_message_id: data.messageId,
      related_id: input.relatedId,
    })
    return { ok: true, mode: 'sent', messageId: data.messageId, outboxId }
  } catch (e) {
    await writeOutbox(env.DB, {
      id: outboxId,
      kind: input.kind,
      to_email: input.to,
      subject: input.subject,
      status: 'failed',
      provider: 'brevo',
      related_id: input.relatedId,
      error: 'network_error',
    })
    console.error(JSON.stringify({ level: 'error', msg: 'email_send_failed', outboxId }))
    return {
      ok: false,
      code: 'EMAIL_NETWORK_ERROR',
      message: 'Email delivery failed temporarily. Your request was still saved.',
      outboxId,
    }
  }
}

/** Hash verification code for storage (never store plaintext). */
export async function hashVerificationCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 6-digit numeric code */
export function generateVerificationCode(): string {
  const n = crypto.getRandomValues(new Uint8Array(4))
  const num = ((n[0]! << 24) | (n[1]! << 16) | (n[2]! << 8) | n[3]!) >>> 0
  return String(num % 1_000_000).padStart(6, '0')
}
