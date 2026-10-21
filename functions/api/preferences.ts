import { optionsResponse, jsonWithCors } from '../_shared/cors'
import type { D1Database } from '../_shared/db/types'
import { resolveIdentity } from '../_shared/auth'
import type { AuthEnv } from '../_shared/auth'

interface Env extends AuthEnv {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

const DEFAULTS = {
  ai: { responseStyle: 'balanced', memoryEnabled: true, webSearchPreference: 'auto' },
  voice: {
    voiceEnabled: true,
    autoSpeak: true,
    voiceId: '933563129e564b19a115bedd57b7406a',
  },
  privacy: { shareUsageAnalytics: true },
}

function merge(partial: unknown) {
  const p = (partial && typeof partial === 'object' ? partial : {}) as Record<string, any>
  return {
    ai: { ...DEFAULTS.ai, ...(p.ai || {}) },
    voice: { ...DEFAULTS.voice, ...(p.voice || {}) },
    privacy: { ...DEFAULTS.privacy, ...(p.privacy || {}) },
  }
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, PUT, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) {
    return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  }
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: true, preferences: DEFAULTS, source: 'default' }, 200)
  }
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'QUOTA_STORE_UNAVAILABLE', error: 'Storage unavailable.' },
      503
    )
  }
  const row = await env.DB.prepare(
    `SELECT preferences_json FROM app_accounts WHERE user_id = ?`
  )
    .bind(idRes.identity.userId)
    .first<{ preferences_json: string }>()
  const prefs = row?.preferences_json ? merge(JSON.parse(row.preferences_json)) : DEFAULTS
  return jsonWithCors(request, env, { success: true, preferences: prefs, source: 'd1' }, 200)
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const idRes = await resolveIdentity(request, env)
  if (!idRes.ok) {
    return jsonWithCors(request, env, { success: false, error: idRes.message }, 401)
  }
  if (!idRes.identity.authenticated) {
    return jsonWithCors(request, env, { success: false, error: 'Sign in to sync preferences.' }, 401)
  }
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'QUOTA_STORE_UNAVAILABLE', error: 'Storage unavailable.' },
      503
    )
  }
  let body: { preferences?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const prefs = merge(body.preferences)
  const now = new Date().toISOString()
  const userId = idRes.identity.userId
  await env.DB
    .prepare(
      `INSERT INTO app_accounts (user_id, email, email_verified, display_name, preferences_json, created_at, updated_at)
       VALUES (?, ?, 0, NULL, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at`
    )
    .bind(userId, idRes.identity.email || null, JSON.stringify(prefs), now, now)
    .run()
  return jsonWithCors(request, env, { success: true, preferences: prefs }, 200)
}
