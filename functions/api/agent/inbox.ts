/**
 * POST /api/agent/inbox
 * Nyven Inbox skill runner — Gmail-backed when OAuth tokens exist server-side.
 *
 * Actions:
 *   search | read | summarize | categorize | draft | send (requires confirmToken)
 *
 * Tokens NEVER returned to the client. No fake mailbox data.
 */

interface Env {
  GEMINI_API_KEY?: string
  GEMINI_CHAT_MODEL?: string
  /** Optional: Google OAuth client for user-delegated Gmail */
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Per-deployment test token only — production should use per-user OAuth store */
  GMAIL_ACCESS_TOKEN?: string
  GMAIL_REFRESH_TOKEN?: string
}

type InboxAction =
  | 'status'
  | 'search'
  | 'read'
  | 'summarize'
  | 'categorize'
  | 'draft'
  | 'send'
  | 'confirm_send'

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

/** In-isolate pending send confirmations (short-lived) */
const pendingSends = new Map<
  string,
  { to: string; subject: string; body: string; agentId: string; expires: number }
>()

function gmailConfigured(env: Env): boolean {
  return !!(env.GMAIL_ACCESS_TOKEN || (env.GMAIL_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID))
}

async function getAccessToken(env: Env): Promise<string | null> {
  if (env.GMAIL_ACCESS_TOKEN) return env.GMAIL_ACCESS_TOKEN
  if (env.GMAIL_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { access_token?: string }
    return data.access_token || null
  }
  return null
}

async function gmailFetch(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getAccessToken(env)
  if (!token) {
    return { ok: false, status: 401, data: { error: 'Gmail is not connected.' } }
  }
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function decodeBody(payload: any): string {
  try {
    const parts = payload?.parts || []
    const flat: any[] = []
    const walk = (ps: any[]) => {
      for (const p of ps || []) {
        if (p.parts) walk(p.parts)
        else flat.push(p)
      }
    }
    walk(parts)
    const textPart =
      flat.find((p) => p.mimeType === 'text/plain') ||
      flat.find((p) => p.mimeType === 'text/html') ||
      payload
    const data = textPart?.body?.data
    if (!data) return ''
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
    // Workers: atob available
    const binary = atob(normalized)
    try {
      return decodeURIComponent(escape(binary))
    } catch {
      return binary
    }
  } catch {
    return ''
  }
}

function headerOf(headers: any[], name: string): string {
  const h = (headers || []).find(
    (x: any) => String(x.name).toLowerCase() === name.toLowerCase()
  )
  return h?.value || ''
}

export const onRequestOptions: PagesFunction<Env> = async () => jsonResponse({}, 204)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  try {
    const body = (await request.json()) as {
      agentId?: string
      action?: InboxAction
      query?: string
      messageId?: string
      threadId?: string
      draftTo?: string
      draftSubject?: string
      draftBody?: string
      confirmToken?: string
      maxResults?: number
    }

    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''
    const action = body.action
    if (!agentId || !action) {
      return jsonResponse({ success: false, error: 'agentId and action are required.' }, 400)
    }

    if (action === 'status') {
      const connected = gmailConfigured(env)
      return jsonResponse(
        {
          success: true,
          connected,
          message: connected
            ? 'Gmail credentials are configured on the server.'
            : 'Gmail is not connected. Authorize Gmail (OAuth) and configure server tokens, or complete the in-app OAuth flow when enabled.',
        },
        200
      )
    }

    if (!gmailConfigured(env)) {
      return jsonResponse(
        {
          success: false,
          error:
            'Gmail is not connected for this deployment. Connect Gmail with OAuth so the server can use a short-lived access token. No fake inbox data is returned.',
          code: 'gmail_not_connected',
        },
        403
      )
    }

    const maxResults = Math.min(Math.max(Number(body.maxResults) || 8, 1), 20)

    if (action === 'search') {
      const q = (body.query || '').trim() || 'in:inbox newer_than:7d'
      const list = await gmailFetch(
        env,
        `/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`
      )
      if (!list.ok) {
        return jsonResponse(
          {
            success: false,
            error: list.data?.error?.message || 'Gmail search failed.',
            code: 'gmail_error',
          },
          list.status >= 400 ? list.status : 502
        )
      }
      const messages = list.data.messages || []
      const previews: any[] = []
      for (const m of messages.slice(0, maxResults)) {
        const meta = await gmailFetch(
          env,
          `/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
        if (!meta.ok) continue
        const headers = meta.data.payload?.headers || []
        previews.push({
          id: m.id,
          threadId: m.threadId || meta.data.threadId,
          from: headerOf(headers, 'From'),
          subject: headerOf(headers, 'Subject'),
          date: headerOf(headers, 'Date'),
          snippet: meta.data.snippet || '',
        })
      }
      return jsonResponse({ success: true, action: 'search', query: q, messages: previews }, 200)
    }

    if (action === 'read' || action === 'summarize' || action === 'categorize') {
      const id = (body.messageId || '').trim()
      if (!id) {
        return jsonResponse({ success: false, error: 'messageId is required.' }, 400)
      }
      const full = await gmailFetch(env, `/users/me/messages/${id}?format=full`)
      if (!full.ok) {
        return jsonResponse(
          {
            success: false,
            error: full.data?.error?.message || 'Could not read message.',
          },
          full.status >= 400 ? full.status : 502
        )
      }
      const headers = full.data.payload?.headers || []
      const email = {
        id,
        threadId: full.data.threadId,
        from: headerOf(headers, 'From'),
        to: headerOf(headers, 'To'),
        subject: headerOf(headers, 'Subject'),
        date: headerOf(headers, 'Date'),
        snippet: full.data.snippet || '',
        bodyText: decodeBody(full.data.payload).slice(0, 12000),
      }

      if (action === 'read') {
        return jsonResponse({ success: true, action: 'read', email }, 200)
      }

      // summarize / categorize via Gemini when available
      if (!env.GEMINI_API_KEY) {
        return jsonResponse({
          success: true,
          action,
          email: {
            id: email.id,
            from: email.from,
            subject: email.subject,
            date: email.date,
          },
          result:
            action === 'summarize'
              ? email.snippet || email.bodyText.slice(0, 400)
              : 'Priority unknown (model unavailable).',
        }, 200)
      }

      const prompt =
        action === 'summarize'
          ? `Summarize this email for the recipient in 3-5 concise bullets.\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.bodyText.slice(0, 6000)}`
          : `Categorize this email for prioritization. Reply with JSON: {"priority":"high|medium|low","category":"string","reason":"short"}.\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.bodyText.slice(0, 4000)}`

      const model = env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
          }),
        }
      )
      const gdata = (await geminiRes.json().catch(() => ({}))) as any
      const text =
        gdata?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ||
        email.snippet

      return jsonResponse(
        {
          success: true,
          action,
          email: {
            id: email.id,
            from: email.from,
            subject: email.subject,
            date: email.date,
          },
          result: text,
        },
        200
      )
    }

    if (action === 'draft') {
      const draftBody = (body.draftBody || '').trim()
      const draftSubject = (body.draftSubject || '').trim() || 'Re: (draft)'
      const draftTo = (body.draftTo || '').trim()
      if (!draftBody) {
        return jsonResponse(
          { success: false, error: 'draftBody is required to create a draft suggestion.' },
          400
        )
      }
      // Draft is a suggestion only — not written to Gmail unless later confirmed as send
      return jsonResponse(
        {
          success: true,
          action: 'draft',
          draft: {
            to: draftTo,
            subject: draftSubject,
            body: draftBody,
            sent: false,
            note: 'Draft only. Not sent. Use action confirm_send with user approval to send.',
          },
          requiresConfirmation: true,
          confirmationPrompt: 'I\'ve prepared this reply. Send it?',
        },
        200
      )
    }

    if (action === 'send') {
      // Staging a send — does not send until confirm_send
      const draftBody = (body.draftBody || '').trim()
      const draftSubject = (body.draftSubject || '').trim()
      const draftTo = (body.draftTo || '').trim()
      if (!draftTo || !draftBody) {
        return jsonResponse(
          { success: false, error: 'draftTo and draftBody are required.' },
          400
        )
      }
      const token = `cfs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      pendingSends.set(token, {
        to: draftTo,
        subject: draftSubject || '(no subject)',
        body: draftBody,
        agentId,
        expires: Date.now() + 10 * 60 * 1000,
      })
      return jsonResponse(
        {
          success: true,
          action: 'send',
          pending: true,
          confirmToken: token,
          preview: { to: draftTo, subject: draftSubject, body: draftBody.slice(0, 500) },
          confirmationPrompt: 'I\'ve prepared this reply. Send it?',
          sent: false,
        },
        200
      )
    }

    if (action === 'confirm_send') {
      const token = (body.confirmToken || '').trim()
      const pending = pendingSends.get(token)
      if (!pending || pending.expires < Date.now() || pending.agentId !== agentId) {
        return jsonResponse(
          { success: false, error: 'Confirmation expired or invalid. Draft was not sent.' },
          400
        )
      }
      pendingSends.delete(token)

      // RFC 2822 raw message
      const raw = [
        `To: ${pending.to}`,
        `Subject: ${pending.subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        pending.body,
      ].join('\r\n')
      const encoded = btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const sendRes = await gmailFetch(env, '/users/me/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: encoded }),
      })
      if (!sendRes.ok) {
        return jsonResponse(
          {
            success: false,
            error: sendRes.data?.error?.message || 'Send failed.',
            sent: false,
          },
          sendRes.status >= 400 ? sendRes.status : 502
        )
      }
      return jsonResponse(
        {
          success: true,
          action: 'confirm_send',
          sent: true,
          messageId: sendRes.data?.id,
        },
        200
      )
    }

    return jsonResponse({ success: false, error: 'Unknown action.' }, 400)
  } catch (err) {
    console.error('NYVEN /api/agent/inbox error:', err)
    return jsonResponse({ success: false, error: 'Inbox request failed.' }, 500)
  }
}
