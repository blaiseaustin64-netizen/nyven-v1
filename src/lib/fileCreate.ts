/** Browser-side file / zip creation for chat download cards. No R2. */

export type CreatedFile = {
  name: string
  mimeType: string
  blob: Blob
  size: number
}

export function createTextFile(name: string, content: string, mime = 'text/plain'): CreatedFile {
  const blob = new Blob([content], { type: mime })
  return { name, mimeType: mime, blob, size: blob.size }
}

/** Minimal ZIP (store only, no compression) for a few text files. */
export async function createZip(files: Array<{ path: string; content: string | Uint8Array }>): Promise<CreatedFile> {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const enc = new TextEncoder()

  const u16 = (n: number) => {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, n, true)
    return b
  }
  const u32 = (n: number) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, true)
    return b
  }
  const concat = (arrs: Uint8Array[]) => {
    const len = arrs.reduce((s, a) => s + a.length, 0)
    const out = new Uint8Array(len)
    let o = 0
    for (const a of arrs) {
      out.set(a, o)
      o += a.length
    }
    return out
  }

  for (const f of files.slice(0, 40)) {
    const nameBytes = enc.encode(f.path.replace(/^\/+/, ''))
    const data =
      typeof f.content === 'string' ? enc.encode(f.content) : f.content
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0), // crc optional for store
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ])
    parts.push(local)
    const cen = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ])
    central.push(cen)
    offset += local.length
  }

  const centralBlob = concat(central)
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBlob.length),
    u32(offset),
    u16(0),
  ])
  const zipBytes = concat([...parts, centralBlob, end])
  const blob = new Blob([zipBytes], { type: 'application/zip' })
  return { name: 'nyven-files.zip', mimeType: 'application/zip', blob, size: blob.size }
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
