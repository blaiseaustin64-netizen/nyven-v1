/**
 * POST /api/chat — NYVEN Core streaming entry (SSE).
 * Events: activity | token | done | error
 */

import type { CoreRequest } from '../_shared/coreTypes'
import { runCore } from '../_shared/coreRuntime'
import { createSseStream } from '../_shared/sse'
import { resolveIdentity } from '../_shared/auth'

interface Env {
  GEMINI_API_KEY: string
  GEMINI_CHAT_MODEL?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  BRAVE_SEARCH_API_KEY?: string
  TAVILY_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  let body: {
    message?: string
    history?: Array<{ role: string; content: string }>
    attachments?: CoreRequest['attachments']
    metadata?: CoreRequest['metadata']
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const hasMessage = typeof body.message === 'string' && body.message.trim().length > 0
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0
  if (!hasMessage && !hasAttachments) {
    return jsonResponse({ success: false, error: 'Message or attachment is required' }, 400)
  }

  const identityResult = await resolveIdentity(request, env, request.signal)
  if (!identityResult.ok) {
    const status = identityResult.code === 'AUTH_CONFIG' ? 503 : 401
    return jsonResponse(
      { success: false, error: identityResult.message, code: identityResult.code },
      status
    )
  }
  const identity = identityResult.identity

  const coreRequest: CoreRequest = {
    message: hasMessage ? body.message! : '',
    attachments: hasAttachments ? body.attachments : [],
    history: Array.isArray(body.history)
      ? body.history
          .filter(
            (m) =>
              m &&
              typeof m.content === 'string' &&
              (m.role === 'user' || m.role === 'assistant')
          )
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
      : [],
    mode: 'chat',
    metadata: body.metadata || {},
    identity: {
      authenticated: identity.authenticated,
      userId: identity.authenticated ? identity.userId : undefined,
    },
  }

  const clientAbort = new AbortController()
  request.signal.addEventListener('abort', () => {
    clientAbort.abort()
  })

  return createSseStream(async (emit, streamAbort) => {
    const combined = new AbortController()
    const onAbort = () => combined.abort()
    clientAbort.signal.addEventListener('abort', onAbort)
    streamAbort.addEventListener('abort', onAbort)

    try {
      await runCore(
        {
          GEMINI_API_KEY: env.GEMINI_API_KEY,
          GEMINI_CHAT_MODEL: env.GEMINI_CHAT_MODEL,
          SERPER_API_KEY: env.SERPER_API_KEY,
          BRAVE_API_KEY: env.BRAVE_API_KEY,
          BRAVE_SEARCH_API_KEY: env.BRAVE_SEARCH_API_KEY,
          TAVILY_API_KEY: env.TAVILY_API_KEY,
        },
        coreRequest,
        emit,
        combined.signal
      )
    } finally {
      clientAbort.signal.removeEventListener('abort', onAbort)
      streamAbort.removeEventListener('abort', onAbort)
    }
  })
}
