import {
  blobToBase64,
  blobToObjectUrl,
  createTextFile,
  createZip,
  type CreatedFile,
} from './fileCreate'
import type { DownloadFileMeta } from '../components/chat/DownloadFileCard'

const MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  json: 'application/json',
  csv: 'text/csv',
  py: 'text/x-python',
  sql: 'application/sql',
  sh: 'application/x-sh',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  zip: 'application/zip',
}

function mimeFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || 'txt'
  return MIME[ext] || 'application/octet-stream'
}

/** Extract nyven-file / nyven-zip fences; return cleaned markdown + file metas. */
export async function extractNyvenFiles(markdown: string): Promise<{
  content: string
  files: DownloadFileMeta[]
}> {
  if (!markdown) return { content: markdown, files: [] }

  const files: DownloadFileMeta[] = []
  let content = markdown

  // ```nyven-file:name.ext\n...\n```
  const fileRe =
    /```nyven-file:([^\s\n]+)\s*\n([\s\S]*?)```/gi
  const fileBlocks: Array<{ full: string; name: string; body: string }> = []
  let m: RegExpExecArray | null
  while ((m = fileRe.exec(markdown)) !== null) {
    fileBlocks.push({ full: m[0], name: m[1].trim(), body: m[2].replace(/\n$/, '') })
  }

  for (const b of fileBlocks) {
    const created = createTextFile(b.name, b.body, mimeFor(b.name))
    const meta = await toMeta(created)
    files.push(meta)
    content = content.replace(b.full, '')
  }

  // ```nyven-zip:archive.zip\npath\n<<<\nbody\n>>>\n...```
  const zipRe = /```nyven-zip:([^\s\n]+)\s*\n([\s\S]*?)```/gi
  const zipBlocks: Array<{ full: string; name: string; body: string }> = []
  while ((m = zipRe.exec(markdown)) !== null) {
    zipBlocks.push({ full: m[0], name: m[1].trim(), body: m[2] })
  }

  for (const b of zipBlocks) {
    const entries = parseZipBody(b.body)
    if (!entries.length) continue
    const zip = await createZip(entries)
    zip.name = b.name.endsWith('.zip') ? b.name : `${b.name}.zip`
    const meta = await toMeta(zip)
    files.push(meta)
    content = content.replace(b.full, '')
  }

  // Fallback: single large ```lang fence when user clearly wanted a downloadable file
  // (handled by caller optionally)

  content = content.replace(/\n{3,}/g, '\n\n').trim()
  return { content, files }
}

function parseZipBody(body: string): Array<{ path: string; content: string }> {
  const entries: Array<{ path: string; content: string }> = []
  // path\n<<<\ncontent\n>>>
  const partRe = /^([^\n<]+)\n<<<\n([\s\S]*?)>>>/gm
  let m: RegExpExecArray | null
  while ((m = partRe.exec(body)) !== null) {
    entries.push({ path: m[1].trim(), content: m[2].replace(/\n$/, '') })
  }
  if (entries.length) return entries
  // JSON fallback
  try {
    const j = JSON.parse(body.trim()) as {
      files?: Array<{ path: string; content: string }>
    }
    if (Array.isArray(j.files)) {
      return j.files
        .filter((f) => f?.path && typeof f.content === 'string')
        .slice(0, 40)
        .map((f) => ({ path: f.path, content: f.content }))
    }
  } catch {
    /* */
  }
  return entries
}

async function toMeta(created: CreatedFile): Promise<DownloadFileMeta> {
  const href = blobToObjectUrl(created.blob)
  let base64: string | undefined
  // Persist small files only (< 200KB)
  if (created.size < 200_000) {
    try {
      base64 = await blobToBase64(created.blob)
    } catch {
      base64 = undefined
    }
  }
  return {
    id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: created.name,
    mimeType: created.mimeType,
    size: created.size,
    href,
    base64,
  }
}

/** User asked for a downloadable file / zip */
export function userWantsDownloadableFile(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\b(download|zip|make (me )?a file|give me (the |a )?file|save as|as a \.zip|export (as|to))\b/.test(
      t
    ) ||
    /\b(create|write|generate)\b.*\b(file|zip|archive)\b/.test(t) ||
    /\b(i want to download|send (me )?the (file|zip))\b/.test(t)
  )
}
