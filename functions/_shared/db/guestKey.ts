/**
 * Server-derived guest subject key.
 * Not elevatable by client claims alone; combines IP hash + optional stable cookie.
 */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * Read or mint a guest_id cookie value (raw). Caller sets Set-Cookie.
 */
export function readGuestCookie(request: Request): string | null {
  const raw = request.headers.get('Cookie') || ''
  const m = /(?:^|;\s*)nyven_guest=([a-zA-Z0-9_-]{16,64})/.exec(raw)
  return m ? m[1] : null
}

export function mintGuestCookieValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function guestCookieHeader(value: string, secure: boolean): string {
  const parts = [
    `nyven_guest=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Stable subject id for usage tables: hash(ip + cookie).
 */
export async function resolveGuestKey(request: Request): Promise<{
  guestKey: string
  cookieValue: string
  setCookie: boolean
}> {
  let cookieValue = readGuestCookie(request)
  let setCookie = false
  if (!cookieValue) {
    cookieValue = mintGuestCookieValue()
    setCookie = true
  }
  const ip = clientIp(request)
  const guestKey = await sha256Hex(`nyven-guest:v1:${ip}:${cookieValue}`)
  return { guestKey, cookieValue, setCookie }
}

export type UsageSubject =
  | { type: 'user'; id: string }
  | { type: 'guest'; id: string }

export async function resolveUsageSubject(
  request: Request,
  authenticatedUserId: string | undefined
): Promise<{
  subject: UsageSubject
  cookieValue?: string
  setCookie?: boolean
}> {
  if (authenticatedUserId) {
    return { subject: { type: 'user', id: authenticatedUserId } }
  }
  const g = await resolveGuestKey(request)
  return {
    subject: { type: 'guest', id: g.guestKey },
    cookieValue: g.cookieValue,
    setCookie: g.setCookie,
  }
}
