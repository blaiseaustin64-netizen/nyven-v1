import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

const BUILDER_SYSTEM = `You are NYVEN Builder, the website-creation system of NYVEN.

NYVEN tagline: Intelligence, built for what's next.
NYVEN is an AI platform created by VEXDYN.
VEXDYN was founded by David.
Gemini is the underlying intelligence provider. The product the user is using is NYVEN.
Never claim that Google created NYVEN.

Your job is to understand a natural-language website request and return structured JSON matching the provided schema.

Rules for files:
- html, css, and js must be complete standalone website files.
- index.html should include a header with navigation, main sections matching the request, and a footer.
- Make it responsive for mobile, tablet, and desktop using CSS media queries.
- Match the requested website type, style, and features.
- Use only client-side HTML, CSS, and JavaScript.
- No server code, no process.env, no eval, no Node APIs, no environment variable access.
- Forms may use simple client-side validation and prevent default submit with a thank-you message.
- Do not mention Gemini, Google, or that the site was AI-generated.
- Produce complete, usable website code — not placeholders or truncated markup.`

const WEBSITE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    project: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        websiteType: { type: 'string' },
        style: { type: 'string' },
      },
      required: ['name', 'slug', 'description', 'websiteType', 'style'],
    },
    design: {
      type: 'object',
      properties: {
        primaryColor: { type: 'string' },
        secondaryColor: { type: 'string' },
        backgroundColor: { type: 'string' },
        textColor: { type: 'string' },
        fontDirection: { type: 'string' },
        visualDirection: { type: 'string' },
      },
      required: [
        'primaryColor',
        'secondaryColor',
        'backgroundColor',
        'textColor',
        'fontDirection',
        'visualDirection',
      ],
    },
    pages: {
      type: 'array',
      items: { type: 'string' },
    },
    sections: {
      type: 'array',
      items: { type: 'string' },
    },
    features: {
      type: 'array',
      items: { type: 'string' },
    },
    content: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        subheadline: { type: 'string' },
        cta: { type: 'string' },
        about: { type: 'string' },
        footer: { type: 'string' },
      },
    },
    responsive: {
      type: 'object',
      properties: {
        mobile: { type: 'boolean' },
        tablet: { type: 'boolean' },
        desktop: { type: 'boolean' },
      },
      required: ['mobile', 'tablet', 'desktop'],
    },
    files: {
      type: 'object',
      properties: {
        html: { type: 'string' },
        css: { type: 'string' },
        js: { type: 'string' },
      },
      required: ['html', 'css', 'js'],
    },
  },
  required: [
    'project',
    'design',
    'pages',
    'sections',
    'features',
    'content',
    'responsive',
    'files',
  ],
} as const

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || `site-${Date.now().toString(36)}`
}

function uniqueSlug(base: string) {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

function isUnsafeClientCode(source: string) {
  const s = source.toLowerCase()
  return (
    s.includes('process.env') ||
    s.includes('eval(') ||
    s.includes('new function') ||
    s.includes('require(') ||
    s.includes('module.exports') ||
    s.includes('__dirname') ||
    s.includes('fs.') ||
    s.includes('child_process') ||
    s.includes('gemini_api_key') ||
    s.includes('<?php') ||
    s.includes('<%')
  )
}

function isValidHtmlDocument(html: string) {
  const h = html.toLowerCase()
  return (
    html.trim().length >= 80 &&
    (h.includes('<html') || h.includes('<!doctype')) &&
    h.includes('<body') &&
    (h.includes('</html>') || h.includes('</body>'))
  )
}

function validateGeneratedFiles(files: { html?: unknown; css?: unknown; js?: unknown }) {
  const html = typeof files.html === 'string' ? files.html : ''
  const css = typeof files.css === 'string' ? files.css : ''
  const js = typeof files.js === 'string' ? files.js : ''

  if (!html.trim() || !css.trim()) {
    return { ok: false as const, reason: 'missing-html-or-css', html, css, js }
  }
  if (!isValidHtmlDocument(html)) {
    return { ok: false as const, reason: 'invalid-html-structure', html, css, js }
  }
  if (isUnsafeClientCode(html) || isUnsafeClientCode(css) || isUnsafeClientCode(js)) {
    return { ok: false as const, reason: 'unsafe-code', html, css, js }
  }
  return { ok: true as const, html, css, js: js || '' }
}

function fallbackFiles(input: {
  name: string
  description: string
  websiteType: string
  style: string
  features: string[]
  primary?: string
  background?: string
  text?: string
}) {
  const primary = input.primary || '#62E6FF'
  const bg = input.background || '#07090D'
  const text = input.text || '#F5F7FA'
  const featureBlocks = (input.features.length ? input.features : ['Contact form'])
    .map(
      (f) =>
        `<section class="section"><div class="wrap"><h2>${f}</h2><p>${f} is ready for your visitors.</p></div></section>`
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${input.name}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="nav">
    <div class="wrap nav-inner">
      <strong class="logo">${input.name}</strong>
      <nav>
        <a href="#home">Home</a>
        <a href="#about">About</a>
        <a href="#features">Explore</a>
        <a href="#contact">Contact</a>
      </nav>
    </div>
  </header>
  <main>
    <section id="home" class="hero">
      <div class="wrap">
        <p class="eyebrow">${input.websiteType || 'Website'} · ${input.style || 'Modern'}</p>
        <h1>${input.name}</h1>
        <p class="lead">${input.description}</p>
        <a class="btn" href="#contact">Get started</a>
      </div>
    </section>
    <section id="about" class="section">
      <div class="wrap">
        <h2>About</h2>
        <p>${input.description}</p>
      </div>
    </section>
    <section id="features">${featureBlocks}</section>
    <section id="contact" class="section">
      <div class="wrap">
        <h2>Contact</h2>
        <form id="contact-form">
          <input type="text" name="name" placeholder="Your name" required />
          <input type="email" name="email" placeholder="Email" required />
          <textarea name="message" placeholder="Message" required></textarea>
          <button type="submit" class="btn">Send</button>
          <p id="form-status" hidden>Thank you. We will be in touch.</p>
        </form>
      </div>
    </section>
  </main>
  <footer class="footer"><div class="wrap"><p>© ${new Date().getFullYear()} ${input.name}</p></div></footer>
  <script src="script.js"></script>
</body>
</html>`

  const css = `:root{--p:${primary};--bg:${bg};--t:${text}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--t);line-height:1.6}
.wrap{width:min(1080px,92%);margin:0 auto}
.nav{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 88%,black);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-inner{display:flex;justify-content:space-between;align-items:center;min-height:64px;gap:16px}
nav{display:flex;gap:16px;flex-wrap:wrap}
nav a{color:inherit;text-decoration:none;opacity:.8}
.hero{padding:88px 0 64px}
.hero h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1;margin:8px 0 16px}
.lead{max-width:640px;opacity:.85}
.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:var(--p)}
.btn{display:inline-block;margin-top:20px;background:var(--p);color:#071018;text-decoration:none;border:0;border-radius:999px;padding:12px 20px;font-weight:600;cursor:pointer}
.section{padding:56px 0;border-top:1px solid rgba(255,255,255,.06)}
form{display:grid;gap:10px;max-width:480px}
input,textarea{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px;color:inherit}
.footer{padding:28px 0;opacity:.7;font-size:14px}
@media (max-width:720px){.nav-inner{flex-direction:column;align-items:flex-start;padding:12px 0} .hero{padding-top:48px}}`

  const js = `document.getElementById('contact-form')?.addEventListener('submit', function (e) {
  e.preventDefault();
  var status = document.getElementById('form-status');
  if (status) status.hidden = false;
  this.reset();
});`

  return { html, css, js }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { description, websiteType, style, features } = (req.body || {}) as {
      description?: string
      websiteType?: string
      style?: string
      features?: string[]
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please describe the website you want NYVEN to build.',
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured')
      return res.status(500).json({
        success: false,
        error: 'NYVEN Builder is temporarily unavailable. Please try again later.',
      })
    }

    const ai = new GoogleGenAI({ apiKey })
    // Builder model is intentionally separate from Chat.
    // Default: gemini-3.8-flash. Optional override: GEMINI_BUILDER_MODEL or GEMINI_MODEL.
    const GEMINI_MODEL =
      process.env.GEMINI_BUILDER_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.8-flash'

    const prompt = `Build a complete website from this request.

Description: ${description.trim()}
Website type: ${websiteType || 'not specified'}
Style: ${style || 'not specified'}
Features: ${(Array.isArray(features) ? features : []).join(', ') || 'none specified'}

Return structured JSON for the website specification and complete client-side files.`

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: BUILDER_SYSTEM,
        temperature: 0.7,
        maxOutputTokens: 32768,
        responseMimeType: 'application/json',
        responseJsonSchema: WEBSITE_JSON_SCHEMA,
      },
    })

    const rawText = (response.text || '').trim()
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      parsed = {}
    }

    const projectBlock = (parsed.project || {}) as Record<string, string>
    const designBlock = (parsed.design || {}) as Record<string, string>
    const filesBlock = (parsed.files || {}) as Record<string, string>
    const contentBlock = (parsed.content || {}) as Record<string, unknown>

    const name =
      projectBlock.name ||
      description.trim().split(/[.!?\n]/)[0].slice(0, 48) ||
      'Untitled Project'
    const baseSlug = slugify(projectBlock.slug || name)
    const slug = uniqueSlug(baseSlug)
    const type = projectBlock.websiteType || websiteType || 'Landing page'
    const chosenStyle = projectBlock.style || style || 'Modern'
    const featureList = Array.isArray(parsed.features)
      ? (parsed.features as string[])
      : Array.isArray(features)
        ? features
        : []

    const validation = validateGeneratedFiles(filesBlock)
    let html = validation.html
    let css = validation.css
    let js = validation.js

    if (!validation.ok) {
      const fallback = fallbackFiles({
        name,
        description: description.trim(),
        websiteType: type,
        style: chosenStyle,
        features: featureList,
        primary: designBlock.primaryColor,
        background: designBlock.backgroundColor,
        text: designBlock.textColor,
      })
      html = fallback.html
      css = fallback.css
      js = fallback.js
    }

    if (
      isUnsafeClientCode(html) ||
      isUnsafeClientCode(css) ||
      isUnsafeClientCode(js) ||
      !isValidHtmlDocument(html)
    ) {
      return res.status(500).json({
        success: false,
        error: 'NYVEN could not produce a safe website for this request. Please try again.',
      })
    }

    const now = new Date().toISOString()
    const project = {
      id: `proj_${Date.now().toString(36)}`,
      name,
      slug,
      description: projectBlock.description || description.trim(),
      websiteType: type,
      style: chosenStyle,
      features: featureList,
      spec: {
        project: {
          name,
          slug,
          description: projectBlock.description || description.trim(),
          websiteType: type,
          style: chosenStyle,
        },
        design: {
          primaryColor: designBlock.primaryColor || '#62E6FF',
          secondaryColor: designBlock.secondaryColor || '#8B7CFF',
          backgroundColor: designBlock.backgroundColor || '#07090D',
          textColor: designBlock.textColor || '#F5F7FA',
          fontDirection: designBlock.fontDirection || 'clean sans-serif',
          visualDirection: designBlock.visualDirection || chosenStyle,
        },
        pages: Array.isArray(parsed.pages) ? parsed.pages : ['Home'],
        sections: Array.isArray(parsed.sections)
          ? parsed.sections
          : ['Hero', 'About', 'Contact'],
        features: featureList,
        content: contentBlock,
        responsive: { mobile: true, tablet: true, desktop: true },
      },
      files: { html, css, js },
      createdAt: now,
      updatedAt: now,
    }

    return res.status(200).json({
      success: true,
      project,
      previewPath: `/preview/${slug}`,
      usedFallback: !validation.ok,
    })
  } catch (err: unknown) {
    console.error('NYVEN /api/build error:', err)
    let userMessage = 'NYVEN could not finish building this website. Please try again.'
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = String((err as { message: string }).message).toLowerCase()
      if (msg.includes('api key') || msg.includes('invalid') || msg.includes('permission')) {
        userMessage = 'NYVEN Builder is temporarily unavailable. Please try again later.'
      } else if (msg.includes('quota') || msg.includes('rate') || msg.includes('resource')) {
        userMessage =
          'NYVEN is receiving many build requests right now. Please wait a moment and try again.'
      }
    }
    return res.status(500).json({ success: false, error: userMessage })
  }
}
