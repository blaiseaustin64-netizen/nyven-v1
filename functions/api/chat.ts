/**
 * POST /api/chat — NYVEN Core streaming entry (SSE).
 * Events: activity | token | done | error
 * Enforces daily chat limits + provider budget when D1 is bound.
 */

import type { CoreRequest } from '../_shared/coreTypes'
import { runCore } from '../_shared/coreRuntime'
import { createSseStream } from '../_shared/sse'
import { resolveIdentity } from '../_shared/auth'
import { corsHeaders, optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../_shared/db/guestKey'
import {
  checkBurst,
  consumeChatMessage,
  consumeProviderRequest,
} from '../_shared/db/usage'

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
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  PROVIDER_BUDGET_GEMINI?: string
  PROVIDER_BUDGET_OPENROUTER?: string
  PROVIDER_BUDGET_OPENROUTER_TTS?: string
  PROVIDER_BUDGET_STT?: string
  PROVIDER_BUDGET_WEB_SEARCH?: string
}

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return optionsResponse(context.request, context.env, 'POST, OPTIONS')
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
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON body' }, 400)
  }

  const hasMessage = typeof body.message === 'string' && body.message.trim().length > 0
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0
  if (!hasMessage && !hasAttachments) {
    return jsonWithCors(
      request,
      env,
      { success: false, error: 'Message or attachment is required' },
      400
    )
  }

  const identityResult = await resolveIdentity(request, env, request.signal)
  if (!identityResult.ok) {
    const status = identityResult.code === 'AUTH_CONFIG' ? 503 : 401
    return jsonWithCors(
      request,
      env,
      { success: false, error: identityResult.message, code: identityResult.code },
      status
    )
  }
  const identity = identityResult.identity
  const userId = identity.authenticated ? identity.userId : undefined

  const usageSubject = await resolveUsageSubject(request, userId)
  const subject = usageSubject.subject

  const burstOk = await checkBurst(env.DB, `chat:${subject.type}:${subject.id}`)
  if (!burstOk.ok) {
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: burstOk.code,
        error: burstOk.message,
      },
      burstOk.httpStatus
    )
  }

  const chatQuota = await consumeChatMessage(
    env.DB,
    subject.type,
    subject.id,
    !!identity.authenticated
  )
  if (!chatQuota.ok) {
    const res = jsonWithCors(
      request,
      env,
      {
        success: false,
        code: chatQuota.code,
        error: chatQuota.message,
        usage: {
          chatCount: chatQuota.snapshot.chatCount,
          chatRemaining: chatQuota.snapshot.chatRemaining,
          limits: chatQuota.snapshot.limits,
          resetsAt: chatQuota.snapshot.resetsAt,
        },
      },
      chatQuota.httpStatus
    )
    if (usageSubject.setCookie && usageSubject.cookieValue) {
      const headers = new Headers(res.headers)
      headers.append(
        'Set-Cookie',
        guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
      )
      return new Response(res.body, { status: res.status, headers })
    }
    return res
  }

  const providerOk = await consumeProviderRequest(env.DB, 'gemini', env)
  if (!providerOk.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: providerOk.code, error: providerOk.message },
      providerOk.httpStatus
    )
  }

  const coreRequest: CoreRequest = {
    message: hasMessage ? body.message! : '',
    attachments: hasAttachments ? body.attachments : [],
    history: Array.isArray(body.history)
      ? body.history
          .filter(
            (m) =>
              m &&
              typeof m.content === 'string' &&
              (m.role === 'user' || m.role === 'assistant' || m.role === 'model')
          )
          .map((m) => ({
            role: (m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user') as
              | 'user'
              | 'assistant',
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

  const sseResponse = createSseStream(async (emit, streamAbort) => {
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

  // Merge CORS + optional guest cookie onto SSE response
  const headers = new Headers(sseResponse.headers)
  const cors = corsHeaders(request, env, 'POST, OPTIONS')
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  if (usageSubject.setCookie && usageSubject.cookieValue) {
    headers.append(
      'Set-Cookie',
      guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
    )
  }

  return new Response(sseResponse.body, { status: 200, headers })
}
