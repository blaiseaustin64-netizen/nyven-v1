/**
 * PBKDF2-SHA-256 password hashing (Web Crypto — Workers compatible).
 * Stored format: pbkdf2$iterations$saltB64$urlSafeHashB64
 */

const ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS
  )
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(bits)}`
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1]!, 10)
  if (!Number.isFinite(iterations) || iterations < 100_000) return false
  const salt = fromB64url(parts[2]!)
  const expected = fromB64url(parts[3]!)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    expected.length * 8
  )
  const actual = new Uint8Array(bits)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
  return diff === 0
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  if (email.length < 5 || email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isStrongPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}
