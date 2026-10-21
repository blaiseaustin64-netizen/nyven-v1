/**
 * Session cookie helpers — HttpOnly, Secure (when HTTPS), SameSite=Lax.
 */

export const SESSION_COOKIE = 'nyven_session'
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

export function parseCookies(request: Request): Record<string, string> {
  const raw = request.headers.get('Cookie') || ''
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function sessionCookieHeader(
  token: string,
  opts: { maxAgeSec: number; secure: boolean }
): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAgeSec}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function requestIsHttps(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'https:') return true
  const proto = request.headers.get('X-Forwarded-Proto') || ''
  return proto.toLowerCase() === 'https'
}
