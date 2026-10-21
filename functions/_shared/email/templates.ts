/**
 * NYVEN branded email templates (inline CSS, mobile-friendly).
 * Brand: bg #07090D, cyan #62E6FF, violet #8B7CFF, text #F5F7FA / #8993A4
 */

const COLORS = {
  bg: '#07090D',
  surface: '#111722',
  text: '#F5F7FA',
  muted: '#8993A4',
  cyan: '#62E6FF',
  violet: '#8B7CFF',
}

function layout(title: string, bodyHtml: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]><style>table{border-collapse:collapse}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.text};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:${COLORS.surface};border-radius:16px;overflow:hidden;border:1px solid rgba(98,230,255,0.12);">
          <tr>
            <td style="padding:28px 28px 12px;text-align:center;">
              <div style="font-size:22px;font-weight:600;letter-spacing:0.04em;color:${COLORS.cyan};">NYVEN</div>
              <div style="font-size:12px;color:${COLORS.muted};margin-top:4px;">Intelligence, built for what&rsquo;s next</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid rgba(137,147,164,0.15);font-size:12px;color:${COLORS.muted};text-align:center;">
              NYVEN Support &middot; Do not reply with passwords or API keys<br/>
              <span style="color:${COLORS.violet};">hellovexdyn@gmail.com</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function verificationEmail(opts: {
  code: string
  expiresMinutes: number
  purpose: 'verify_email' | 'password_reset'
}): { subject: string; html: string; text: string } {
  const isReset = opts.purpose === 'password_reset'
  const subject = isReset ? 'Reset your NYVEN password' : 'Verify your NYVEN email'
  const heading = isReset ? 'Password reset code' : 'Your verification code'
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:${COLORS.text};">${heading}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${COLORS.muted};">
      Use this code in NYVEN. It expires in <strong style="color:${COLORS.text};">${opts.expiresMinutes} minutes</strong>.
      If you did not request this, you can ignore this email.
    </p>
    <div style="margin:20px 0;padding:16px;text-align:center;background:${COLORS.bg};border-radius:12px;border:1px solid rgba(98,230,255,0.2);">
      <span style="font-size:28px;letter-spacing:0.35em;font-weight:600;color:${COLORS.cyan};">${escapeHtml(opts.code)}</span>
    </div>
    <p style="margin:0;font-size:13px;color:${COLORS.muted};">Never share this code with anyone.</p>
  `
  const text = `${subject}\n\nCode: ${opts.code}\nExpires in ${opts.expiresMinutes} minutes.\n\nIf you did not request this, ignore this email.\n— NYVEN Support`
  return { subject, html: layout(subject, bodyHtml, subject), text }
}

export function feedbackNotifyEmail(opts: {
  feedbackType: 'positive' | 'negative'
  feedbackId: string
  conversationId?: string | null
  messageId?: string | null
  userId?: string | null
  reason?: string | null
}): { subject: string; html: string; text: string } {
  const subject = `[NYVEN] Feedback ${opts.feedbackType} (${opts.feedbackId.slice(0, 8)})`
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:18px;color:${COLORS.text};">User feedback</h1>
    <p style="font-size:14px;color:${COLORS.muted};line-height:1.6;">
      Type: <strong style="color:${COLORS.cyan};">${opts.feedbackType}</strong><br/>
      ID: ${escapeHtml(opts.feedbackId)}<br/>
      Message: ${escapeHtml(opts.messageId || '—')}<br/>
      Conversation: ${escapeHtml(opts.conversationId || '—')}<br/>
      User: ${escapeHtml(opts.userId ? '[authenticated]' : 'guest')}<br/>
      Reason: ${escapeHtml((opts.reason || '—').slice(0, 200))}
    </p>
    <p style="font-size:12px;color:${COLORS.muted};">Conversation content is not included by default.</p>
  `
  const text = `${subject}\nType: ${opts.feedbackType}\nID: ${opts.feedbackId}\nMessage: ${opts.messageId || '—'}\nReason: ${(opts.reason || '—').slice(0, 200)}`
  return { subject, html: layout(subject, bodyHtml, subject), text }
}

export function bugNotifyEmail(opts: {
  reportId: string
  summary: string
  category: string
  details?: string
  route?: string
  userId?: string | null
}): { subject: string; html: string; text: string } {
  const subject = `[NYVEN] Bug report ${opts.reportId.slice(0, 8)} — ${opts.category}`
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:18px;color:${COLORS.text};">Bug report</h1>
    <p style="font-size:14px;color:${COLORS.muted};line-height:1.6;">
      ID: ${escapeHtml(opts.reportId)}<br/>
      Category: ${escapeHtml(opts.category)}<br/>
      Route: ${escapeHtml(opts.route || '—')}<br/>
      User: ${escapeHtml(opts.userId ? '[authenticated]' : 'guest')}<br/>
    </p>
    <p style="font-size:14px;color:${COLORS.text};"><strong>Summary</strong><br/>${escapeHtml(opts.summary)}</p>
    ${
      opts.details
        ? `<p style="font-size:13px;color:${COLORS.muted};white-space:pre-wrap;">${escapeHtml(opts.details.slice(0, 2000))}</p>`
        : ''
    }
  `
  const text = `${subject}\n\n${opts.summary}\n\n${(opts.details || '').slice(0, 2000)}\n\nID: ${opts.reportId}`
  return { subject, html: layout(subject, bodyHtml, subject), text }
}

export function passwordResetEmail(opts: {
  resetUrl: string
  expiresMinutes: number
}): { subject: string; html: string; text: string } {
  const subject = 'Reset your NYVEN password'
  const body = `
    <p style="margin:0 0 16px;color:${COLORS.text};font-size:15px;line-height:1.5;">
      We received a request to reset your NYVEN password.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(opts.resetUrl)}" style="display:inline-block;background:${COLORS.cyan};color:#07090D;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">
        Reset password
      </a>
    </p>
    <p style="margin:0;color:${COLORS.muted};font-size:13px;">
      This link expires in ${opts.expiresMinutes} minutes. If you did not request a reset, you can ignore this email.
    </p>`
  return {
    subject,
    html: layout(subject, body, 'Reset your NYVEN password'),
    text: `Reset your NYVEN password\n\n${opts.resetUrl}\n\nExpires in ${opts.expiresMinutes} minutes.`,
  }
}
