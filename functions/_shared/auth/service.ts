/**
 * Cloudflare D1 authentication service — users, sessions, email tokens.
 */

import type { D1Database } from '../db/types'
import { hashPassword, verifyPassword, normalizeEmail, isValidEmail, isStrongPassword } from './password'
import { randomToken, sha256Hex, newId } from './tokens'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  parseCookies,
  sessionCookieHeader,
  clearSessionCookieHeader,
  requestIsHttps,
} from './cookies'
import { checkBurst } from '../db/usage'

export type AuthUserRow = {
  id: string
  email: string
  email_normalized: string
  password_hash: string
  display_name: string | null
  email_verified: number
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export type PublicUser = {
  id: string
  email: string
  displayName: string | null
  emailVerified: boolean
  createdAt: string
}

function toPublic(u: AuthUserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    emailVerified: !!u.email_verified,
    createdAt: u.created_at,
  }
}

export type AuthServiceEnv = {
  DB?: D1Database
  APP_URL?: string
  /** Optional pepper mixed into session hashes */
  AUTH_SESSION_SECRET?: string
}

function requireDb(env: AuthServiceEnv): D1Database {
  if (!env.DB) throw Object.assign(new Error('DB unavailable'), { code: 'QUOTA_STORE_UNAVAILABLE' })
  return env.DB
}

export async function findUserByEmail(
  db: D1Database,
  email: string
): Promise<AuthUserRow | null> {
  const norm = normalizeEmail(email)
  return (
    (await db
      .prepare(`SELECT * FROM auth_users WHERE email_normalized = ?`)
      .bind(norm)
      .first<AuthUserRow>()) || null
  )
}

export async function findUserById(
  db: D1Database,
  id: string
): Promise<AuthUserRow | null> {
  return (
    (await db.prepare(`SELECT * FROM auth_users WHERE id = ?`).bind(id).first<AuthUserRow>()) ||
    null
  )
}

export async function registerUser(
  env: AuthServiceEnv,
  input: { email: string; password: string; displayName?: string }
): Promise<
  | { ok: true; user: PublicUser; verifyToken: string }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  try {
    const db = requireDb(env)
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message: 'Authentication is unavailable: D1 binding DB is missing on this Pages Function. Bind nyven-db as DB and redeploy.',
      httpStatus: 503,
    }
  }
  const db = env.DB!

  const email = input.email.trim()
  if (!isValidEmail(email)) {
    return { ok: false, code: 'INVALID_EMAIL', message: 'Enter a valid email address.', httpStatus: 400 }
  }
  if (!isStrongPassword(input.password)) {
    return {
      ok: false,
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters.',
      httpStatus: 400,
    }
  }

  const existing = await findUserByEmail(db, email)
  if (existing) {
    // Anti-enumeration: same message as success path guidance
    return {
      ok: false,
      code: 'EMAIL_IN_USE',
      message: 'An account with this email already exists. Try logging in instead.',
      httpStatus: 409,
    }
  }

  const id = newId()
  const now = new Date().toISOString()
  const password_hash = await hashPassword(input.password)
  const display_name = (input.displayName || '').trim().slice(0, 80) || null

  try {
    await db
      .prepare(
        `INSERT INTO auth_users
          (id, email, email_normalized, password_hash, display_name, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(id, email, normalizeEmail(email), password_hash, display_name, now, now)
      .run()

    const verifyToken = randomToken(24)
    const tokenHash = await sha256Hex(verifyToken)
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    await db
      .prepare(
        `INSERT INTO auth_email_tokens (id, user_id, purpose, token_hash, expires_at, created_at, attempts)
         VALUES (?, ?, 'verify_email', ?, ?, ?, 0)`
      )
      .bind(newId(), id, tokenHash, expires, now)
      .run()

    const user = await findUserById(db, id)
    if (!user) {
      return {
        ok: false,
        code: 'REGISTER_READBACK_FAILED',
        message: 'Account write succeeded but user could not be loaded. Try signing in.',
        httpStatus: 500,
      }
    }
    return { ok: true, user: toPublic(user), verifyToken }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('registerUser D1 error', msg.slice(0, 200))
    // Unique constraint → treat as email in use
    if (/unique|constraint|already/i.test(msg)) {
      return {
        ok: false,
        code: 'EMAIL_IN_USE',
        message: 'An account with this email already exists. Try logging in instead.',
        httpStatus: 409,
      }
    }
    return {
      ok: false,
      code: 'REGISTER_DB_ERROR',
      message: `Could not create account (database error). ${msg.slice(0, 120)}`,
      httpStatus: 500,
    }
  }
}

export async function loginUser(
  env: AuthServiceEnv,
  request: Request,
  input: { email: string; password: string }
): Promise<
  | { ok: true; user: PublicUser; sessionToken: string; setCookie: string }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  if (!env.DB) {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message: 'Authentication is unavailable: D1 binding DB is missing on this Pages Function. Bind nyven-db as DB and redeploy.',
      httpStatus: 503,
    }
  }
  const db = env.DB

  const burst = await checkBurst(db, `auth-login:${normalizeEmail(input.email)}`, 10, 60_000)
  if (!burst.ok) {
    return { ok: false, code: burst.code, message: burst.message, httpStatus: burst.httpStatus }
  }

  const user = await findUserByEmail(db, input.email)
  // Constant-ish failure message
  const fail = (): {
    ok: false
    code: string
    message: string
    httpStatus: number
  } => ({
    ok: false,
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is incorrect.',
    httpStatus: 401,
  })

  if (!user) {
    await hashPassword(input.password) // mitigate timing
    return fail()
  }

  const valid = await verifyPassword(input.password, user.password_hash)
  if (!valid) return fail()

  const sessionToken = randomToken(32)
  const tokenHash = await sha256Hex(
    env.AUTH_SESSION_SECRET ? `${env.AUTH_SESSION_SECRET}:${sessionToken}` : sessionToken
  )
  const now = Date.now()
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString()
  const sessionId = newId()
  const ua = (request.headers.get('User-Agent') || '').slice(0, 300)
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    ''
  const ipHash = ip ? await sha256Hex(ip) : null

  await db
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(sessionId, user.id, tokenHash, expiresAt, new Date(now).toISOString(), ua, ipHash)
    .run()

  await db
    .prepare(`UPDATE auth_users SET last_login_at = ?, updated_at = ? WHERE id = ?`)
    .bind(new Date(now).toISOString(), new Date(now).toISOString(), user.id)
    .run()

  const setCookie = sessionCookieHeader(sessionToken, {
    maxAgeSec: Math.floor(SESSION_TTL_MS / 1000),
    secure: requestIsHttps(request),
  })

  return { ok: true, user: toPublic(user), sessionToken, setCookie }
}

export async function logoutSession(
  env: AuthServiceEnv,
  request: Request
): Promise<{ setCookie: string }> {
  const secure = requestIsHttps(request)
  const cookies = parseCookies(request)
  const token = cookies[SESSION_COOKIE]
  if (token && env.DB) {
    const tokenHash = await sha256Hex(
      env.AUTH_SESSION_SECRET ? `${env.AUTH_SESSION_SECRET}:${token}` : token
    )
    await env.DB
      .prepare(
        `UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`
      )
      .bind(new Date().toISOString(), tokenHash)
      .run()
  }
  return { setCookie: clearSessionCookieHeader(secure) }
}

export async function resolveSessionUser(
  env: AuthServiceEnv,
  request: Request
): Promise<PublicUser | null> {
  if (!env.DB) return null
  const cookies = parseCookies(request)
  let token = cookies[SESSION_COOKIE]
  if (!token) {
    // Optional Bearer for API clients
    const h = request.headers.get('Authorization') || ''
    const m = /^Bearer\s+(.+)$/i.exec(h.trim())
    if (m) token = m[1]!.trim()
  }
  if (!token) return null

  const tokenHash = await sha256Hex(
    env.AUTH_SESSION_SECRET ? `${env.AUTH_SESSION_SECRET}:${token}` : token
  )
  const row = await env.DB
    .prepare(
      `SELECT s.id as session_id, s.expires_at, s.revoked_at, u.*
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first<AuthUserRow & { session_id: string; expires_at: string; revoked_at: string | null }>()

  if (!row || row.revoked_at) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  return toPublic(row)
}

export async function verifyEmailToken(
  env: AuthServiceEnv,
  rawToken: string
): Promise<{ ok: true; user: PublicUser } | { ok: false; code: string; message: string }> {
  if (!env.DB) {
    return { ok: false, code: 'QUOTA_STORE_UNAVAILABLE', message: 'Service unavailable.' }
  }
  const tokenHash = await sha256Hex(rawToken)
  const row = await env.DB
    .prepare(
      `SELECT * FROM auth_email_tokens WHERE token_hash = ? AND purpose = 'verify_email'`
    )
    .bind(tokenHash)
    .first<{
      id: string
      user_id: string
      expires_at: string
      consumed_at: string | null
      attempts: number
    }>()

  if (!row || row.consumed_at) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'This verification link is invalid or expired.' }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 'EXPIRED_TOKEN', message: 'This verification link has expired.' }
  }

  const now = new Date().toISOString()
  await env.DB
    .prepare(`UPDATE auth_email_tokens SET consumed_at = ? WHERE id = ?`)
    .bind(now, row.id)
    .run()
  await env.DB
    .prepare(`UPDATE auth_users SET email_verified = 1, updated_at = ? WHERE id = ?`)
    .bind(now, row.user_id)
    .run()

  const user = await findUserById(env.DB, row.user_id)
  return { ok: true, user: toPublic(user!) }
}

export async function createPasswordResetToken(
  env: AuthServiceEnv,
  email: string
): Promise<
  | { ok: true; token?: string; userId?: string; emitted: boolean }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  if (!env.DB) {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message: 'Service unavailable.',
      httpStatus: 503,
    }
  }
  const burst = await checkBurst(env.DB, `auth-reset:${normalizeEmail(email)}`, 5, 3600_000)
  if (!burst.ok) {
    return { ok: false, code: burst.code, message: burst.message, httpStatus: burst.httpStatus }
  }

  const user = await findUserByEmail(env.DB, email)
  // Always succeed from caller perspective for anti-enumeration
  if (!user) {
    return { ok: true, emitted: false }
  }

  const token = randomToken(24)
  const tokenHash = await sha256Hex(token)
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 1000 * 60 * 60).toISOString()
  await env.DB
    .prepare(
      `INSERT INTO auth_email_tokens (id, user_id, purpose, token_hash, expires_at, created_at, attempts)
       VALUES (?, ?, 'password_reset', ?, ?, ?, 0)`
    )
    .bind(newId(), user.id, tokenHash, expires, now)
    .run()

  return { ok: true, token, userId: user.id, emitted: true }
}

export async function resetPasswordWithToken(
  env: AuthServiceEnv,
  rawToken: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; code: string; message: string; httpStatus: number }> {
  if (!env.DB) {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message: 'Service unavailable.',
      httpStatus: 503,
    }
  }
  if (!isStrongPassword(newPassword)) {
    return {
      ok: false,
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters.',
      httpStatus: 400,
    }
  }

  const tokenHash = await sha256Hex(rawToken)
  const row = await env.DB
    .prepare(
      `SELECT * FROM auth_email_tokens WHERE token_hash = ? AND purpose = 'password_reset'`
    )
    .bind(tokenHash)
    .first<{
      id: string
      user_id: string
      expires_at: string
      consumed_at: string | null
    }>()

  if (!row || row.consumed_at) {
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: 'This reset link is invalid or has already been used.',
      httpStatus: 400,
    }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      code: 'EXPIRED_TOKEN',
      message: 'This reset link has expired.',
      httpStatus: 400,
    }
  }

  const password_hash = await hashPassword(newPassword)
  const now = new Date().toISOString()
  await env.DB
    .prepare(`UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(password_hash, now, row.user_id)
    .run()
  await env.DB
    .prepare(`UPDATE auth_email_tokens SET consumed_at = ? WHERE id = ?`)
    .bind(now, row.id)
    .run()
  // Revoke all sessions
  await env.DB
    .prepare(
      `UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
    )
    .bind(now, row.user_id)
    .run()

  return { ok: true }
}
