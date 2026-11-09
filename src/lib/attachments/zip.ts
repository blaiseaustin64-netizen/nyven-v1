/**
 * Client-side ZIP expansion for chat/project attachments.
 * Never runs on the server. Zip-bomb and path-traversal guards included.
 */

const SKIP_DIR_PARTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.turbo',
  'vendor',
])

const SKIP_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'cargo.lock',
  'poetry.lock',
  'bun.lockb',
])

const TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.dockerfile',
  '.gitignore',
  '.svg',
])

const MAX_ENTRIES = 300
const MAX_FILE_CHARS = 20_000
const MAX_TOTAL_CHARS = 120_000
/** Reject archives that claim > 80MB uncompressed total. */
const MAX_DECLARED_UNCOMPRESSED = 80 * 1024 * 1024

function isTextPath(path: string): boolean {
  const base = path.split('/').pop() || path
  if (SKIP_FILE_NAMES.has(base.toLowerCase())) return false
  const i = base.lastIndexOf('.')
  if (i < 0) return false
  return TEXT_EXTS.has(base.slice(i).toLowerCase())
}

function shouldSkipPath(path: string): boolean {
  if (!path || path.endsWith('/')) return true
  if (path.startsWith('/') || path.includes('..')) return true
  const parts = path.split(/[/\\]/)
  for (const p of parts) {
    if (SKIP_DIR_PARTS.has(p)) return true
  }
  return false
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Decompression not supported in this browser')
  }
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

type ZipEntry = {
  name: string
  method: number
  compSize: number
  uncompSize: number
  dataOffset: number
}

function parseLocalEntries(view: DataView, bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = []
  let offset = 0
  let declaredUncompressed = 0
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true)
    if (sig !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const uncompSize = view.getUint32(offset + 22, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen + compSize > bytes.length) break
    const nameBytes = bytes.subarray(nameStart, nameEnd)
    const name = new TextDecoder('utf-8').decode(nameBytes)
    const dataOffset = nameEnd + extraLen
    declaredUncompressed += uncompSize
    if (declaredUncompressed > MAX_DECLARED_UNCOMPRESSED) {
      throw new Error('Archive is too large to process safely')
    }
    entries.push({ name, method, compSize, uncompSize, dataOffset })
    offset = dataOffset + compSize
    if (entries.length > MAX_ENTRIES + 50) break
  }
  return entries
}

export type ZipExtractResult = {
  fileCount: number
  textContent: string
  truncated: boolean
}

/**
 * Expand a zip File in the browser into a single text summary for the model.
 */
export async function extractZipForChat(file: File): Promise<ZipExtractResult> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const entries = parseLocalEntries(view, bytes)

  const tree: string[] = []
  const bodies: string[] = []
  let totalChars = 0
  let truncated = false
  let fileCount = 0
  let processed = 0

  for (const entry of entries) {
    if (shouldSkipPath(entry.name)) continue
    fileCount += 1
    tree.push(entry.name)
    if (processed >= MAX_ENTRIES) {
      truncated = true
      continue
    }
    if (!isTextPath(entry.name)) continue
    if (entry.method !== 0 && entry.method !== 8) continue

    try {
      const raw = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compSize)
      const inflated = entry.method === 0 ? raw : await inflateRaw(raw)
      let text = new TextDecoder('utf-8', { fatal: false }).decode(inflated)
      // Skip binary-ish content
      if (text.includes('\u0000')) continue
      if (text.length > MAX_FILE_CHARS) {
        text = text.slice(0, MAX_FILE_CHARS) + '\n… truncated'
        truncated = true
      }
      const block = `--- ${entry.name} ---\n${text}\n`
      if (totalChars + block.length > MAX_TOTAL_CHARS) {
        truncated = true
        break
      }
      bodies.push(block)
      totalChars += block.length
      processed += 1
    } catch {
      /* skip corrupt entry */
    }
  }

  const header = `ZIP archive: ${file.name}\nFiles listed: ${fileCount}${truncated ? ' (truncated)' : ''}\n\nFile tree:\n${tree.slice(0, MAX_ENTRIES).map((n) => `- ${n}`).join('\n')}\n\n`
  let content = header + bodies.join('\n')
  if (content.length > MAX_TOTAL_CHARS) {
    content = content.slice(0, MAX_TOTAL_CHARS) + '\n… truncated'
    truncated = true
  }
  return { fileCount, textContent: content, truncated }
}
