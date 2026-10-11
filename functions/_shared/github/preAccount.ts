/**
 * Pre-account connector subject + encrypted cookie store for GitHub tokens.
 * Used while full NYVEN user accounts are postponed.
 * When Supabase auth is present, routes prefer the authenticated user + DB.
 * Never logs or returns raw tokens.
 */

import { encryptToken, decryptToken, randomUrlSafe, hmacSign, hmacVerify } from './crypto'

export const OWNER_COOKIE = 'nyven_conn_owner'
export const GH_STORE_COOKIE = 'nyven_gh_pre'
export const PRE_PREFIX = 'pre_'

export type PreAccountGitHubStore = {
  access_token: string
  account_label: string
  scopes: string[]
  connected_at: string
  github_user_id?: number
  owner_id: string
}

export function isPreAccountSubject(id: string): boolean {
  return id.startsWith(PRE_PREFIX)
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return rest.join('=')
      }
    }
  }
  return null
}

export function cookieHeader(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean }
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAge}`,
    opts.secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function clearCookieHeader(name: string, secure: boolean): string {
  return [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

/** Stable pre-account owner id from cookie, or create a new one. */
export async function resolvePreAccountOwner(
  request: Request,
  secret: string
): Promise<{ ownerId: string; setCookie?: string }> {
  const existing = readCookie(request, OWNER_COOKIE)
  if (existing) {
    const verified = await verifyOwnerCookie(existing, secret)
    if (verified) return { ownerId: verified }
  }
  const ownerId = PRE_PREFIX + randomUrlSafe(18)
  const packed = await packOwnerCookie(ownerId, secret)
  const secure = request.url.startsWith('https')
  return {
    ownerId,
    setCookie: cookieHeader(OWNER_COOKIE, packed, {
      maxAge: 60 * 60 * 24 * 400,
      secure,
    }),
  }
}

async function packOwnerCookie(ownerId: string, secret: string): Promise<string> {
  const payload = btoa(JSON.stringify({ ownerId, exp: Date.now() + 60 * 60 * 24 * 400 * 1000 }))
  const sig = await hmacSign(payload, secret)
  return `${payload}.${sig}`
}

async function verifyOwnerCookie(val: string, secret: string): Promise<string | null> {
  const i = val.lastIndexOf('.')
  if (i < 1) return null
  const payload = val.slice(0, i)
  const sig = val.slice(i + 1)
  if (!(await hmacVerify(payload, sig, secret))) return null
  try {
    const data = JSON.parse(atob(payload)) as { ownerId?: string; exp?: number }
    if (!data.ownerId || !data.ownerId.startsWith(PRE_PREFIX)) return null
    if (data.exp && Date.now() > data.exp) return null
    return data.ownerId
  } catch {
    return null
  }
}

export async function savePreAccountGitHub(
  store: PreAccountGitHubStore,
  secret: string,
  secure: boolean
): Promise<string> {
  const blob = await encryptToken(JSON.stringify(store), secret)
  return cookieHeader(GH_STORE_COOKIE, blob, {
    maxAge: 60 * 60 * 24 * 30,
    secure,
  })
}

export async function loadPreAccountGitHub(
  request: Request,
  secret: string,
  ownerId: string
): Promise<PreAccountGitHubStore | null> {
  const raw = readCookie(request, GH_STORE_COOKIE)
  if (!raw) return null
  const plain = await decryptToken(raw, secret)
  if (!plain) return null
  try {
    const data = JSON.parse(plain) as PreAccountGitHubStore
    if (!data.access_token || data.owner_id !== ownerId) return null
    return data
  } catch {
    return null
  }
}

export function clearPreAccountGitHubCookie(secure: boolean): string {
  return clearCookieHeader(GH_STORE_COOKIE, secure)
}
