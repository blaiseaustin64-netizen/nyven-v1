/**
 * GET /api/health — production diagnostics (no secrets).
 */
import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveSessionUser } from '../_shared/auth/service'

interface Env {
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }
  GROQ_API_KEY?: string
  OPENROUTER_API_KEY?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  BRAVE_SEARCH_API_KEY?: string
  TAVILY_API_KEY?: string

  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
  GEMINI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  BRAVE_SEARCH_API_KEY?: string
  TAVILY_API_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const d1Bound = !!env.DB
  let d1Ok = false
  let d1Error: string | null = null
  let tableProbe: string | null = null
  let authTablesOk = false
  let authTablesMissing: string[] = []

  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='usage_daily' LIMIT 1`
      ).first<{ name: string }>()
      d1Ok = !!row?.name
      tableProbe = row?.name || null
      if (!d1Ok) d1Error = 'usage_daily table not found on bound database'

      const needed = ['auth_users', 'auth_sessions', 'auth_email_tokens']
      const found: string[] = []
      for (const name of needed) {
        const t = await env.DB.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
        )
          .bind(name)
          .first<{ name: string }>()
        if (t?.name) found.push(name)
        else authTablesMissing.push(name)
      }
      authTablesOk = authTablesMissing.length === 0
    } catch (e) {
      d1Error = e instanceof Error ? e.message.slice(0, 120) : 'query_failed'
    }
  } else {
    d1Error = 'env.DB is undefined — Pages Function has no D1 binding named DB'
  }

  let authenticated = false
  try {
    const user = await resolveSessionUser(env, request)
    authenticated = !!user
  } catch {
    authenticated = false
  }

  const status = d1Bound && d1Ok ? 200 : 503
  return jsonWithCors(
    request,
    env,
    {
      success: d1Bound && d1Ok,
      service: 'nyven',
      d1Bound,
      d1Ok,
      d1Error,
      tableProbe,
      authTablesOk,
      authTablesMissing,
      authenticated,
      hasGeminiKey: !!env.GEMINI_API_KEY,
      hasOpenRouterKey: !!env.OPENROUTER_API_KEY,
      sttConfigured: !!(env.AI || (env.GROQ_API_KEY && env.GROQ_API_KEY.trim())),
      ttsConfigured: !!(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()),
      workersAiBound: !!env.AI,
      searchConfigured: !!(
        (env.SERPER_API_KEY && env.SERPER_API_KEY.trim()) ||
        (env.BRAVE_API_KEY && env.BRAVE_API_KEY.trim()) ||
        (env.BRAVE_SEARCH_API_KEY && env.BRAVE_SEARCH_API_KEY.trim()) ||
        (env.TAVILY_API_KEY && env.TAVILY_API_KEY.trim())
      ),
      searchProvider: env.SERPER_API_KEY?.trim()
        ? 'serper'
        : (env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY)?.trim()
          ? 'brave'
          : env.TAVILY_API_KEY?.trim()
            ? 'tavily'
            : null,
      appUrlSet: !!(env.APP_URL && env.APP_URL.startsWith('http')),
    },
    status
  )
}
