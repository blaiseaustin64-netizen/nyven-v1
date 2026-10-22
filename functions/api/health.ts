/**
 * GET /api/health — production diagnostics (no secrets).
 * Use to verify D1 binding and optional auth session without side effects.
 */
import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveSessionUser } from '../_shared/auth/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
  GEMINI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const d1Bound = !!env.DB
  let d1Ok = false
  let d1Error: string | null = null
  let tableProbe: string | null = null

  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='usage_daily' LIMIT 1`
      ).first<{ name: string }>()
      d1Ok = !!row?.name
      tableProbe = row?.name || null
      if (!d1Ok) {
        d1Error = 'usage_daily table not found on bound database'
      }
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
      authenticated,
      hasGeminiKey: !!env.GEMINI_API_KEY,
      hasOpenRouterKey: !!env.OPENROUTER_API_KEY,
      appUrlSet: !!(env.APP_URL && env.APP_URL.startsWith('http')),
    },
    status
  )
}
