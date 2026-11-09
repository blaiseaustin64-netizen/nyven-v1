/**
 * Lazy-load pdf.js from cdnjs (pinned). No npm dependency.
 * Worker from the same CDN. Failures resolve to null.
 */
const PDFJS_VER = '3.11.174'
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`

type PdfJsLib = {
  getDocument: (src: { data: ArrayBuffer | Uint8Array }) => { promise: Promise<PdfDocument> }
  GlobalWorkerOptions: { workerSrc: string }
}

type PdfDocument = {
  numPages: number
  getPage: (n: number) => Promise<PdfPage>
}

type PdfPage = {
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>
  getViewport: (opts: { scale: number }) => { width: number; height: number }
  render: (opts: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => { promise: Promise<void> }
}

let loadPromise: Promise<PdfJsLib | null> | null = null

export function loadPdfJs(): Promise<PdfJsLib | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve) => {
    const existing = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib
    if (existing?.getDocument) {
      existing.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
      resolve(existing)
      return
    }
    const script = document.createElement('script')
    script.src = `${PDFJS_CDN}/pdf.min.js`
    script.async = true
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib
      if (!lib?.getDocument) {
        resolve(null)
        return
      }
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
      resolve(lib)
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return loadPromise
}

/** Letter ratio quality check — rejects mostly non-letter / gibberish output. */
export function isReadableText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 40) return false
  const letters = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length
  const ratio = letters / cleaned.length
  // Also reject long runs of control-ish symbols
  const weird = (cleaned.match(/[^\w\s.,;:!?'"()\-/%@&+]/g) || []).length
  if (weird / cleaned.length > 0.35) return false
  return ratio >= 0.45
}

export async function extractPdfWithPdfJs(
  file: File,
  opts?: { maxPages?: number; maxChars?: number }
): Promise<{
  text: string
  pageCount: number
  truncated: boolean
  scanned: boolean
  pageImages?: string[]
  error?: string
}> {
  const maxPages = opts?.maxPages ?? 50
  const maxChars = opts?.maxChars ?? 120_000
  const lib = await loadPdfJs()
  if (!lib) {
    return {
      text: '',
      pageCount: 0,
      truncated: false,
      scanned: true,
      error: 'PDF reader could not load on this device.',
    }
  }
  const data = await file.arrayBuffer()
  let doc: PdfDocument
  try {
    doc = await lib.getDocument({ data }).promise
  } catch {
    return {
      text: '',
      pageCount: 0,
      truncated: false,
      scanned: true,
      error: 'Could not open this PDF.',
    }
  }
  const pageCount = doc.numPages
  const limit = Math.min(pageCount, maxPages)
  const parts: string[] = []
  let total = 0
  let truncated = false
  for (let i = 1; i <= limit; i++) {
    try {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((it) => it.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (pageText) {
        if (total + pageText.length > maxChars) {
          parts.push(pageText.slice(0, Math.max(0, maxChars - total)))
          truncated = true
          break
        }
        parts.push(pageText)
        total += pageText.length
      }
    } catch {
      /* skip page */
    }
  }
  if (pageCount > maxPages) truncated = true
  const text = parts.join('\n\n')
  const readable = isReadableText(text)

  if (!readable) {
    // Render up to 5 pages as images for vision
    const pageImages: string[] = []
    const renderLimit = Math.min(pageCount, 5)
    for (let i = 1; i <= renderLimit; i++) {
      try {
        const page = await doc.getPage(i)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(viewport.width, 1024)
        canvas.height = Math.min(viewport.height, 1440)
        const scale = Math.min(1024 / viewport.width, 1.2)
        const vp = page.getViewport({ scale })
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        pageImages.push(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        /* */
      }
    }
    return {
      text: '',
      pageCount,
      truncated,
      scanned: true,
      pageImages,
    }
  }

  return { text, pageCount, truncated, scanned: false }
}

export async function renderPdfPagesToCanvas(
  file: File | ArrayBuffer,
  container: HTMLElement,
  maxPages = 20
): Promise<{ ok: boolean; error?: string }> {
  const lib = await loadPdfJs()
  if (!lib) return { ok: false, error: 'PDF reader unavailable' }
  const data = file instanceof File ? await file.arrayBuffer() : file
  let doc: PdfDocument
  try {
    doc = await lib.getDocument({ data }).promise
  } catch {
    return { ok: false, error: 'Could not open PDF' }
  }
  container.innerHTML = ''
  const limit = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1.15 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.className = 'max-w-full h-auto mx-auto mb-3 rounded shadow-lg'
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    container.appendChild(canvas)
  }
  return { ok: true }
}
