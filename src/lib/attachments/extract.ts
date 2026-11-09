/**
 * Browser-side extraction for chat + project Files.
 * Zip/docx via native inflate; no server-side zip parse.
 */
import { extractZipForChat } from './zip'

export type ExtractMeta = {
  kind: 'zip' | 'docx' | 'xlsx' | 'pdf' | 'text' | 'image' | 'unknown'
  fileCount?: number
  truncated?: boolean
  scanned?: boolean
  status?: string
}

export type ExtractResult = {
  text: string
  meta: ExtractMeta
  /** Scanned PDF page images as data URLs (max 5) for vision */
  pageImages?: string[]
}

const MAX_TOTAL = 120_000

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Minimal ZIP local-file reader for docx/xlsx (OOXML). */
async function readZipEntries(
  file: File
): Promise<Array<{ name: string; data: Uint8Array }>> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const out: Array<{ name: string; data: Uint8Array }> = []
  let offset = 0
  let declared = 0
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const uncompSize = view.getUint32(offset + 22, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen + compSize > bytes.length) break
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd))
    const dataOffset = nameEnd + extraLen
    declared += uncompSize
    if (declared > 80 * 1024 * 1024) throw new Error('Archive is too large to process safely')
    const raw = bytes.subarray(dataOffset, dataOffset + compSize)
    if (!name.endsWith('/') && !name.includes('..') && !name.startsWith('/')) {
      try {
        const data = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null
        if (data) out.push({ name, data })
      } catch {
        /* skip */
      }
    }
    offset = dataOffset + compSize
    if (out.length > 400) break
  }
  return out
}

function stripXml(xml: string): string {
  return xml
    .replace(/<w:p[\s>]/g, '\n')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocx(file: File): Promise<ExtractResult> {
  const entries = await readZipEntries(file)
  const doc = entries.find((e) => e.name === 'word/document.xml')
  if (!doc) return { text: '', meta: { kind: 'docx', truncated: false } }
  const xml = new TextDecoder('utf-8', { fatal: false }).decode(doc.data)
  let text = stripXml(xml)
  let truncated = false
  if (text.length > MAX_TOTAL) {
    text = text.slice(0, MAX_TOTAL) + '\n… truncated'
    truncated = true
  }
  return { text, meta: { kind: 'docx', truncated } }
}

/** Minimal XLSX: sharedStrings + first sheets as TSV-ish text */
async function extractXlsx(file: File): Promise<ExtractResult> {
  const entries = await readZipEntries(file)
  const ssEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml')
  const strings: string[] = []
  if (ssEntry) {
    const xml = new TextDecoder('utf-8', { fatal: false }).decode(ssEntry.data)
    const re = /<t[^>]*>([^<]*)<\/t>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) strings.push(m[1])
  }
  const sheetFiles = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
    .slice(0, 5)
  const parts: string[] = []
  let truncated = false
  for (const sh of sheetFiles) {
    const xml = new TextDecoder('utf-8', { fatal: false }).decode(sh.data)
    const rows: string[] = []
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g
    let rm: RegExpExecArray | null
    let rowCount = 0
    while ((rm = rowRe.exec(xml)) && rowCount < 200) {
      const cells: string[] = []
      const cRe = /<c[^>]*?(t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?/g
      let cm: RegExpExecArray | null
      while ((cm = cRe.exec(rm[1]))) {
        const t = cm[2]
        const v = cm[3] || ''
        if (t === 's') cells.push(strings[Number(v)] || '')
        else cells.push(v)
      }
      if (cells.length) {
        rows.push(cells.join('\t'))
        rowCount++
      }
    }
    if (rowCount >= 200) truncated = true
    parts.push(`Sheet: ${sh.name}\n${rows.join('\n')}`)
  }
  let text = parts.join('\n\n')
  if (text.length > MAX_TOTAL) {
    text = text.slice(0, MAX_TOTAL) + '\n… truncated'
    truncated = true
  }
  return { text, meta: { kind: 'xlsx', truncated, fileCount: sheetFiles.length } }
}

async function extractPdf(file: File): Promise<ExtractResult> {
  const { extractPdfWithPdfJs, isReadableText } = await import('./pdfjsLoader')
  const result = await extractPdfWithPdfJs(file)
  if (result.error && !result.pageImages?.length) {
    return {
      text: '',
      meta: {
        kind: 'pdf',
        truncated: false,
        scanned: true,
        status: 'no readable content (could not open PDF)',
      },
    }
  }
  if (result.scanned || !isReadableText(result.text)) {
    return {
      text: '',
      meta: {
        kind: 'pdf',
        truncated: result.truncated,
        scanned: true,
        status: 'no readable content (scanned or image-based PDF)',
      },
      pageImages: result.pageImages,
    }
  }
  return {
    text: result.text,
    meta: {
      kind: 'pdf',
      truncated: result.truncated,
      scanned: false,
      status: result.truncated ? 'partial' : 'text included',
    },
  }
}


export async function extractAttachmentFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase()
  const mime = (file.type || '').toLowerCase()

  if (name.endsWith('.zip') || mime.includes('zip')) {
    const z = await extractZipForChat(file)
    return {
      text: z.textContent,
      meta: { kind: 'zip', fileCount: z.fileCount, truncated: z.truncated },
    }
  }
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
    return extractDocx(file)
  }
  if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) {
    return extractXlsx(file)
  }
  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    return extractPdf(file)
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|json|csv|ts|tsx|js|jsx|css|html|yml|yaml)$/i.test(name)
  ) {
    let text = await file.text()
    let truncated = false
    if (text.length > MAX_TOTAL) {
      text = text.slice(0, MAX_TOTAL) + '\n… truncated'
      truncated = true
    }
    return { text, meta: { kind: 'text', truncated } }
  }
  if (mime.startsWith('image/')) {
    return { text: '', meta: { kind: 'image' } }
  }
  return { text: '', meta: { kind: 'unknown' } }
}
