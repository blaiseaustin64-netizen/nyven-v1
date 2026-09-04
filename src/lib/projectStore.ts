import type { NyvenProject } from './builderTypes'

const KEY = 'nyven_builder_projects_v1'

function readAll(): Record<string, NyvenProject> {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, NyvenProject>
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, NyvenProject>) {
  sessionStorage.setItem(KEY, JSON.stringify(map))
}

export function saveProject(project: NyvenProject) {
  const map = readAll()
  map[project.slug] = project
  map[project.id] = project
  writeAll(map)
}

export function getProjectBySlug(slug: string): NyvenProject | null {
  const map = readAll()
  return map[slug] || null
}

export function listProjects(): NyvenProject[] {
  const map = readAll()
  const seen = new Set<string>()
  const out: NyvenProject[] = []
  for (const p of Object.values(map)) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      out.push(p)
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/**
 * Build a fully self-contained HTML document for iframe srcDoc preview.
 * Always inlines generated CSS/JS. Removes local styles.css / script.js refs
 * and strips external executable <script src="..."> resources.
 */
export function composePreviewDocument(files: { html: string; css: string; js: string }) {
  let doc = files.html || '<!doctype html><html><head></head><body></body></html>'
  const css = typeof files.css === 'string' ? files.css : ''
  const js = typeof files.js === 'string' ? files.js : ''

  doc = doc.replace(
    /<link\b[^>]*href=["']?\s*(?:\.\/)?styles\.css["']?[^>]*>/gi,
    ''
  )
  doc = doc.replace(
    /<script\b[^>]*src=["']?\s*(?:\.\/)?script\.js["']?[^>]*>\s*<\/script>/gi,
    ''
  )
  doc = doc.replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi,
    ''
  )
  doc = doc.replace(
    /<script\b[^>]*\bsrc\s*=\s*[^>\s]+[^>]*>\s*<\/script>/gi,
    ''
  )

  if (css.trim()) {
    const styleTag = `<style id="nyven-generated-css">${css}</style>`
    if (/<\/head>/i.test(doc)) {
      doc = doc.replace(/<\/head>/i, `${styleTag}</head>`)
    } else if (/<body\b/i.test(doc)) {
      doc = doc.replace(/<body\b/i, `${styleTag}<body`)
    } else {
      doc = styleTag + doc
    }
  }

  if (js.trim()) {
    const scriptTag = `<script id="nyven-generated-js">${js}</script>`
    if (/<\/body>/i.test(doc)) {
      doc = doc.replace(/<\/body>/i, `${scriptTag}</body>`)
    } else if (/<\/html>/i.test(doc)) {
      doc = doc.replace(/<\/html>/i, `${scriptTag}</html>`)
    } else {
      doc += scriptTag
    }
  }

  return doc
  }
