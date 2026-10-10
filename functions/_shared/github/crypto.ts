/**
 * Encrypt connector tokens at rest (AES-GCM).
 * Key from CONNECTOR_TOKEN_SECRET (any string; hashed to 256-bit).
 */

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
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

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptToken(
  plaintext: string,
  secret: string
): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  )
  return `v1.${b64url(iv)}.${b64url(ct)}`
}

export async function decryptToken(
  blob: string,
  secret: string
): Promise<string | null> {
  try {
    const [v, ivB, ctB] = blob.split('.')
    if (v !== 'v1' || !ivB || !ctB) return null
    const key = await deriveKey(secret)
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64url(ivB) },
      key,
      fromB64url(ctB)
    )
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

export async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return b64url(sig)
}

export async function hmacVerify(
  payload: string,
  sig: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSign(payload, secret)
  if (expected.length !== sig.length) return false
  let ok = 0
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  return ok === 0
}

export function randomUrlSafe(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}
