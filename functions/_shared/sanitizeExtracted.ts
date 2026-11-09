const INTERNAL_MARKERS =
  /\b(endstream|endobj|\/Type\s*\/|obj\s*<<|stream\r?\n|%PDF-|<w:|<\/w:|word\/document\.xml|xl\/worksheets)/i

export function looksLikeBinaryOrMarkup(text: string): boolean {
  if (!text || text.length < 8) return false
  if (INTERNAL_MARKERS.test(text)) return true
  let nonPrintable = 0
  let symbols = 0
  const sample = text.slice(0, 4000)
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c < 9 || (c > 13 && c < 32) || c === 0xfffd) nonPrintable++
    else if (!/[A-Za-z0-9\s.,;:!?'"()\-/%@&+]/.test(sample[i])) symbols++
  }
  return (nonPrintable + symbols) / sample.length > 0.1
}

export function sanitizeExtractedText(raw: string | undefined | null): string {
  if (!raw) return ''
  let t = String(raw)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
  if (!t) return ''
  if (looksLikeBinaryOrMarkup(t)) return ''
  return t.replace(/\n{4,}/g, '\n\n\n')
}
