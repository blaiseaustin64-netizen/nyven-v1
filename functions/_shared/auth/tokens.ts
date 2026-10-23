/** Opaque random tokens + SHA-256 hashes for storage */

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  let s = ''
  for (let i = 0; i < buf.length; i++) s += buf[i]!.toString(16).padStart(2, '0')
  return s
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Cryptographically random six-digit email verification code. */
export function generateSixDigitCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(1))
  return String(values[0]! % 1_000_000).padStart(6, '0')
}
