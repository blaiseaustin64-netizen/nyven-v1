/**
 * Cloudflare D1 authentication service — users, sessions, email tokens.
 */

import type { D1Database } from '../db/types'
import { hashPassword, verifyPassword, normalizeEmail, isValidEmail, isStrongPassword } from './password'
import { randomToken, sha256Hex, newId, generateSixDigitCode } from './tokens'
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
  | { ok: true; user: PublicUser; verifyCode: string }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  try {
    const db = requireDb(env)
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message: 'Authentication is unavailable: D1 binding DB may be missing. Bind nyven-db as DB and redeploy.',
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
      message: 'An account with this email already exists. Sign in, or verify your email if you just registered.',
      httpStatus: 409,
    }
  }

  const id = newId()
  const now = new Date().toISOString()
  const password_hash = await hashPassword(input.password)
  const display_name = (input.displayName || '').trim().slice(0, 80) || null

  await db
    .prepare(
      `INSERT INTO auth_users
        (id, email, email_normalized, password_hash, display_name, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(id, email, normalizeEmail(email), password_hash, display_name, now, now)
    .run()

  const verificationId = newId()
  const verifyCode = generateSixDigitCode()
  // Bind the hash to the random record ID; never store the plaintext code.
  const tokenHash = await sha256Hex(`${verificationId}:${verifyCode}`)
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await db
    .prepare(
      `INSERT INTO auth_email_tokens (id, user_id, purpose, token_hash, expires_at, created_at, attempts)
       VALUES (?, ?, 'verify_email', ?, ?, ?, 0)`
    )
    .bind(verificationId, id, tokenHash, expires, now)
    .run()

  const user = await findUserById(db, id)
  return { ok: true, user: toPublic(user!), verifyCode }
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
      message: 'Authentication is unavailable: D1 binding DB may be missing. Bind nyven-db as DB and redeploy.',
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
  if (!user.email_verified) {
    return {
      ok: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email with the six-digit code before signing in.',
      httpStatus: 403,
    }
  }

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

  if (!row || row.revoked_at || !row.email_verified) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  return toPublic(row)
}

/** Verify a six-digit email code. Codes expire after five minutes and allow five attempts. */
export async function verifyEmailCode(
  env: AuthServiceEnv,
  emailInput: string,
  codeInput: string
): Promise<{ ok: true; user: PublicUser } | { ok: false; code: string; message: string }> {
  if (!env.DB) return { ok: false, code: 'QUOTA_STORE_UNAVAILABLE', message: 'Service unavailable.' }
  const email = emailInput.trim()
  const code = codeInput.trim()
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return { ok: false, code: 'INVALID_CODE', message: 'Enter the six-digit code from your email.' }
  }
  const user = await findUserByEmail(env.DB, email)
  if (!user || user.email_verified) {
    return { ok: false, code: 'INVALID_CODE', message: 'This code is invalid or expired. Request a new code if needed.' }
  }
  const row = await env.DB
    .prepare(
      `SELECT id, user_id, token_hash, expires_at, consumed_at, attempts
       FROM auth_email_tokens
       WHERE user_id = ? AND purpose = 'verify_email' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(user.id)
    .first<{
      id: string
      user_id: string
      token_hash: string
      expires_at: string
      consumed_at: string | null
      attempts: number
    }>()
  if (!row) return { ok: false, code: 'INVALID_CODE', message: 'This code is invalid or expired. Request a new code if needed.' }
  if (row.attempts >= 5) {
    return { ok: false, code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Request a new verification code.' }
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare(`UPDATE auth_email_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`)
      .bind(new Date().toISOString(), row.id).run()
    return { ok: false, code: 'EXPIRED_CODE', message: 'Your verification code has expired. Request a new one.' }
  }
  const candidateHash = await sha256Hex(`${row.id}:${code}`)
  if (candidateHash !== row.token_hash) {
    await env.DB.prepare(`UPDATE auth_email_tokens SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < 5`)
      .bind(row.id).run()
    return { ok: false, code: 'INVALID_CODE', message: 'That code is incorrect. Check the email and try again.' }
  }
  const now = new Date().toISOString()
  const consume = await env.DB.prepare(
    `UPDATE auth_email_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND attempts < 5`
  ).bind(now, row.id).run()
  if ((consume.meta?.changes ?? 0) !== 1) {
    return { ok: false, code: 'INVALID_CODE', message: 'This code has already been used. Request a new one if needed.' }
  }
  await env.DB.prepare(`UPDATE auth_email_tokens SET consumed_at = COALESCE(consumed_at, ?) WHERE user_id = ? AND purpose = 'verify_email' AND id <> ?`)
    .bind(now, user.id, row.id).run()
  await env.DB.prepare(`UPDATE auth_users SET email_verified = 1, updated_at = ? WHERE id = ? AND email_verified = 0`)
    .bind(now, user.id).run()
  const verified = await findUserById(env.DB, user.id)
  return { ok: true, user: toPublic(verified!) }
}

/** Issue a fresh code for an unverified account; callers must return the same public message either way. */
export async function issueVerificationCode(
  env: AuthServiceEnv,
  emailInput: string
): Promise<{ ok: true; emitted: false } | { ok: true; emitted: true; code: string; userId: string } | { ok: false; code: string; message: string; httpStatus: number }> {
  if (!env.DB) return { ok: false, code: 'QUOTA_STORE_UNAVAILABLE', message: 'Service unavailable.', httpStatus: 503 }
  const email = emailInput.trim()
  if (!isValidEmail(email)) return { ok: true, emitted: false }
  const user = await findUserByEmail(env.DB, email)
  if (!user || user.email_verified) return { ok: true, emitted: false }
  const now = new Date().toISOString()
  // A resend invalidates every previous verification code for this account.
  await env.DB.prepare(
    `UPDATE auth_email_tokens SET consumed_at = COALESCE(consumed_at, ?)
     WHERE user_id = ? AND purpose = 'verify_email' AND consumed_at IS NULL`
  ).bind(now, user.id).run()
  const id = newId()
  const code = generateSixDigitCode()
  const tokenHash = await sha256Hex(`${id}:${code}`)
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await env.DB.prepare(
    `INSERT INTO auth_email_tokens (id, user_id, purpose, token_hash, expires_at, created_at, attempts)
     VALUES (?, ?, 'verify_email', ?, ?, ?, 0)`
  ).bind(id, user.id, tokenHash, expires, now).run()
  return { ok: true, emitted: true, code, userId: user.id }
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
