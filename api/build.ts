import type { VercelRequest, VercelResponse } from '@vercel/node'

const BUILDER_SYSTEM = `You are NYVEN Builder — the website creation engine of NYVEN.

NYVEN tagline: Intelligence, built for what's next.
NYVEN is an AI platform created by VEXDYN, founded by David Augustine.
You are NOT Gemini, Google, DeepSeek, or OpenRouter. The user is using NYVEN.

ROLE
You act simultaneously as:
- senior product designer
- senior UI/UX designer
- senior frontend engineer
- responsive web specialist
- accessibility-conscious engineer
- interaction designer
- visual art director

MISSION
Do not generate a basic HTML page.
Design and engineer a polished, production-quality website that feels designed by a high-end digital studio.

Before writing code, internally decide a coherent visual system from:
website type, user description, style, audience, brand personality, features.

VISUAL SYSTEM (required)
Typography:
- deliberate font stacks (system or Google Fonts links allowed for fonts only)
- clear hierarchy for display, h1–h3, body, labels, nav, buttons, captions
- never rely on browser-default unstyled text

Color:
- background, surface, elevated surface, primary text, secondary text, accent, borders
- palette must match the requested style (luxury, minimal, modern, playful, corporate, creative, etc.)
- do not force the same black+cyan theme for every site

Spacing:
- consistent spacing scale
- no huge unexplained empty regions
- no cramped sections
- balanced section padding

Layout:
Choose intentional layouts appropriate to the brief:
split hero, centered hero, editorial, asymmetric, card grids, bento, feature grids, project showcases, alternating sections, testimonials, pricing, storytelling.
Do NOT force one layout onto every website.

COMPONENTS
Use polished components that share one design system:
modern nav, styled CTAs, cards, project cards, feature cards, badges/pills, testimonials, pricing cards, contact forms, image placeholders, stats, section headers, footer, mobile navigation.

HERO
Never output only: H1 + paragraph + plain link.
Build a composed hero with strong headline, supporting copy, primary CTA, optional secondary CTA, and a visual treatment (gradient, orb, grid, mock panel, abstract shape, product frame, stats, or trust indicators).

BUTTONS & INTERACTIONS
Never use plain browser-default links as primary CTAs.
Buttons need padding, radius matching the design, hover/focus/active states, transitions, accessible contrast.
Links need hover/focus states.

ANIMATION
Add subtle purposeful motion: fade-in, slide-up, reveal-on-scroll, hover elevation, button transitions.
Respect prefers-reduced-motion.
Do not over-animate.

RESPONSIVE (mandatory)
Design for desktop, tablet, and mobile.
- mobile nav must collapse (hamburger / drawer) when multiple links exist
- grids stack sensibly
- type scales
- no horizontal overflow
- forms and buttons remain usable
- images/cards scale

ACCESSIBILITY
Semantic HTML, proper heading order, labeled inputs, keyboard focus states, meaningful link text, sufficient contrast, aria where needed.

FUNCTIONALITY
JS must implement real basic interactions when relevant:
mobile nav toggle, smooth anchors, accordion, form validation/preventDefault thank-you, simple tabs/filters if present.
Do not ship fake dead buttons.

CONTENT
Write realistic coherent copy for the website type (portfolio, SaaS, restaurant, ecommerce, landing, blog, etc.).
No meaningless lorem repetition.

OUTPUT FORMAT
Return ONLY valid JSON matching the schema. No markdown fences.

files.html / files.css / files.js must be complete standalone client-side code.
- Responsive, polished, production-feeling
- No server code, no process.env, no eval, no require
- Forms: client-side only
- Prefer inline-friendly structure; local styles.css / script.js names may appear but preview will inline CSS/JS
- Do not require external executable scripts (fonts CSS links OK)

QUALITY BAR
The result must not look like plain browser HTML, unstyled links, default blue buttons, or a vertical stack of generic text.`

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
    pages: { type: 'array', items: { type: 'string' } },
    sections: { type: 'array', items: { type: 'string' } },
    features: { type: 'array', items: { type: 'string' } },
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
    s.includes('openrouter_api_key') ||
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

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fence ? fence[1].trim() : trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Malformed model response')
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}

/** Higher-quality fallback so preview never looks like bare browser HTML */
function fallbackFiles(input: {
  name: string
  description: string
  websiteType: string
  style: string
  features: string[]
  primary?: string
  secondary?: string
  background?: string
  text?: string
}) {
  const primary = input.primary || '#62E6FF'
  const secondary = input.secondary || '#8B7CFF'
  const bg = input.background || '#07090D'
  const text = input.text || '#F5F7FA'
  const features = input.features.length ? input.features : ['Contact form']

  const featureCards = features
    .map(
      (f, i) =>
        `<article class="card reveal" style="--d:${0.1 * (i + 1)}s"><span class="badge">${String(
          i + 1
        ).padStart(2, '0')}</span><h3>${f}</h3><p>${f} designed as a polished interface element with clear hierarchy and spacing.</p></article>`
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${input.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <div class="bg-glow" aria-hidden="true"></div>
  <header class="nav">
    <div class="wrap nav-inner">
      <a class="logo" href="#home">${input.name}</a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span>
      </button>
      <nav id="site-nav" class="nav-links">
        <a href="#about">About</a>
        <a href="#work">Work</a>
        <a href="#skills">Skills</a>
        <a href="#contact">Contact</a>
      </nav>
    </div>
  </header>
  <main>
    <section id="home" class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy reveal">
          <p class="eyebrow">${input.websiteType || 'Website'} · ${input.style || 'Modern'}</p>
          <h1>${input.name}</h1>
          <p class="lead">${input.description}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#contact">Start a project</a>
            <a class="btn btn-ghost" href="#work">View work</a>
          </div>
        </div>
        <div class="hero-visual reveal" style="--d:.15s" aria-hidden="true">
          <div class="panel">
            <div class="panel-bar"><span></span><span></span><span></span></div>
            <div class="panel-body">
              <div class="stat"><strong>10+</strong><span>Projects</span></div>
              <div class="stat"><strong>5y</strong><span>Experience</span></div>
              <div class="stat"><strong>100%</strong><span>Focus</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section id="about" class="section">
      <div class="wrap narrow reveal">
        <p class="section-label">About</p>
        <h2>Designed with intention</h2>
        <p>${input.description}</p>
      </div>
    </section>
    <section id="work" class="section">
      <div class="wrap">
        <div class="section-head reveal">
          <p class="section-label">Selected work</p>
          <h2>Projects that define the craft</h2>
        </div>
        <div class="grid-3">
          <article class="card project reveal"><div class="thumb"></div><h3>Aurora Platform</h3><p>Product design and frontend systems for a modern SaaS experience.</p></article>
          <article class="card project reveal" style="--d:.1s"><div class="thumb t2"></div><h3>Signal Commerce</h3><p>Conversion-focused storefront with refined product storytelling.</p></article>
          <article class="card project reveal" style="--d:.2s"><div class="thumb t3"></div><h3>Nova Studio</h3><p>Portfolio and brand system for a creative technology practice.</p></article>
        </div>
      </div>
    </section>
    <section id="skills" class="section">
      <div class="wrap">
        <div class="section-head reveal">
          <p class="section-label">Capabilities</p>
          <h2>What ships with this experience</h2>
        </div>
        <div class="grid-3">${featureCards}</div>
      </div>
    </section>
    <section id="contact" class="section">
      <div class="wrap contact-grid">
        <div class="reveal">
          <p class="section-label">Contact</p>
          <h2>Let's build what's next</h2>
          <p class="muted">Share a short brief. This form validates on the client and confirms without a backend.</p>
        </div>
        <form id="contact-form" class="form-card reveal" style="--d:.12s" novalidate>
          <label>Name<input type="text" name="name" required autocomplete="name" /></label>
          <label>Email<input type="email" name="email" required autocomplete="email" /></label>
          <label>Message<textarea name="message" rows="4" required></textarea></label>
          <button type="submit" class="btn btn-primary">Send message</button>
          <p id="form-status" class="form-status" hidden>Thank you — your message is ready.</p>
        </form>
      </div>
    </section>
  </main>
  <footer class="footer">
    <div class="wrap footer-inner">
      <strong>${input.name}</strong>
      <p>© ${new Date().getFullYear()} · Built with NYVEN</p>
    </div>
  </footer>
</body>
</html>`

  const css = `:root{
  --bg:${bg};--surface:color-mix(in srgb,${bg} 82%,#fff 8%);--elev:color-mix(in srgb,${bg} 70%,#fff 12%);
  --text:${text};--muted:color-mix(in srgb,${text} 62%,transparent);
  --accent:${primary};--accent-2:${secondary};--border:rgba(255,255,255,.08);
  --radius:18px;--font-display:"Space Grotesk",Inter,system-ui,sans-serif;--font-body:Inter,system-ui,sans-serif;
}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:var(--font-body);background:var(--bg);color:var(--text);line-height:1.6;overflow-x:hidden}
.wrap{width:min(1120px,92%);margin:0 auto}
.bg-glow{position:fixed;inset:-20% auto auto 40%;width:min(60vw,520px);height:min(60vw,520px);background:radial-gradient(circle,color-mix(in srgb,var(--accent) 28%,transparent),transparent 70%);pointer-events:none;z-index:0;filter:blur(10px)}
.nav,.hero,.section,.footer{position:relative;z-index:1}
.nav{position:sticky;top:0;backdrop-filter:blur(14px);background:color-mix(in srgb,var(--bg) 78%,transparent);border-bottom:1px solid var(--border)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;min-height:68px;gap:16px}
.logo{font-family:var(--font-display);font-weight:600;text-decoration:none;color:inherit;letter-spacing:-.02em}
.nav-links{display:flex;gap:18px;align-items:center}
.nav-links a{color:var(--muted);text-decoration:none;font-size:14px;transition:color .2s}
.nav-links a:hover,.nav-links a:focus-visible{color:var(--text)}
.nav-toggle{display:none;background:transparent;border:0;width:42px;height:42px;border-radius:12px;cursor:pointer}
.nav-toggle span{display:block;height:2px;margin:6px 8px;background:var(--text);transition:transform .2s}
.hero{padding:72px 0 56px}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:36px;align-items:center}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--accent);margin:0 0 12px}
.hero h1,.section h2{font-family:var(--font-display);letter-spacing:-.03em;line-height:1.08;margin:0 0 14px}
.hero h1{font-size:clamp(2.4rem,6vw,4.2rem);font-weight:600}
.lead{max-width:34rem;color:var(--muted);font-size:1.05rem;margin:0 0 22px}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:12px 20px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid transparent;cursor:pointer;transition:transform .2s,background .2s,border-color .2s,box-shadow .2s}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#071018;box-shadow:0 10px 30px color-mix(in srgb,var(--accent) 28%,transparent)}
.btn-primary:hover{transform:translateY(-1px)}
.btn-ghost{background:transparent;border-color:var(--border);color:var(--text)}
.btn-ghost:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--border));background:color-mix(in srgb,var(--accent) 8%,transparent)}
.panel{border:1px solid var(--border);border-radius:24px;background:linear-gradient(160deg,var(--elev),var(--surface));overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.panel-bar{display:flex;gap:6px;padding:12px 14px;border-bottom:1px solid var(--border)}
.panel-bar span{width:8px;height:8px;border-radius:50%;background:var(--border)}
.panel-body{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:22px}
.stat{padding:14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.stat strong{display:block;font-family:var(--font-display);font-size:1.35rem}
.stat span{font-size:12px;color:var(--muted)}
.section{padding:72px 0;border-top:1px solid var(--border)}
.section-label{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--accent);margin:0 0 8px}
.section h2{font-size:clamp(1.6rem,3vw,2.2rem)}
.narrow{max-width:720px}
.muted{color:var(--muted)}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.card{padding:20px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);transition:transform .25s,border-color .25s,box-shadow .25s}
.card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));box-shadow:0 18px 40px rgba(0,0,0,.25)}
.card h3{font-family:var(--font-display);margin:10px 0 8px;font-size:1.1rem}
.card p{margin:0;color:var(--muted);font-size:14px}
.badge{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:11px;border:1px solid var(--border);color:var(--accent)}
.thumb{height:140px;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 35%,#111),#1a1f2b);margin-bottom:12px}
.thumb.t2{background:linear-gradient(135deg,color-mix(in srgb,var(--accent-2) 40%,#111),#171c28)}
.thumb.t3{background:linear-gradient(145deg,#1b2433,color-mix(in srgb,var(--accent) 25%,#0d1118))}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
.form-card{display:grid;gap:12px;padding:22px;border-radius:22px;background:var(--surface);border:1px solid var(--border)}
label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
input,textarea{width:100%;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text);padding:12px 14px;font:inherit}
input:focus,textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 55%,transparent);border-color:transparent}
.form-status{color:var(--accent);margin:0}
.footer{border-top:1px solid var(--border);padding:28px 0;color:var(--muted);font-size:14px}
.footer-inner{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.reveal{opacity:0;transform:translateY(14px);animation:rise .7s ease forwards;animation-delay:var(--d,0s)}
@keyframes rise{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;animation:none}.btn,.card{transition:none}}
@media (max-width:900px){
  .hero-grid,.contact-grid,.grid-3{grid-template-columns:1fr}
  .nav-toggle{display:inline-flex;flex-direction:column;justify-content:center}
  .nav-links{position:absolute;right:4%;top:68px;display:none;flex-direction:column;align-items:stretch;min-width:200px;padding:12px;border-radius:16px;background:var(--elev);border:1px solid var(--border);box-shadow:0 20px 40px rgba(0,0,0,.35)}
  .nav-links.open{display:flex}
  .hero{padding-top:48px}
}`

  const js = `(() => {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (status) status.hidden = false;
    form.reset();
  });
})();`

  return { html, css, js }
}

async function callOpenRouter(params: {
  apiKey: string
  model: string
  system: string
  user: string
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nyven.app',
        'X-Title': 'NYVEN Builder',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.7,
        max_tokens: 16000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.system },
          {
            role: 'user',
            content:
              params.user +
              '\n\nRespond with a single JSON object matching this schema keys: project, design, pages, sections, features, content, responsive, files. files must include complete html, css, and js strings.',
          },
        ],
      }),
      signal: controller.signal,
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        (data && (data.error?.message || data.message)) ||
        `OpenRouter error (${res.status})`
      const err = new Error(String(msg)) as Error & { status?: number }
      err.status = res.status
      throw err
    }

    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.message?.reasoning ||
      ''
    if (!content || typeof content !== 'string') {
      throw new Error('Empty model response')
    }
    return content
  } finally {
    clearTimeout(timeout)
  }
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

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY is not configured')
      return res.status(500).json({
        success: false,
        error: 'NYVEN Builder is temporarily unavailable. Please try again later.',
      })
    }

    const BUILDER_MODEL =
      process.env.OPENROUTER_BUILDER_MODEL || 'deepseek/deepseek-v4-flash-0731'

    const prompt = `Build a complete production-quality website from this request.

Description: ${description.trim()}
Website type: ${websiteType || 'not specified'}
Style: ${style || 'not specified'}
Features: ${(Array.isArray(features) ? features : []).join(', ') || 'none specified'}

Return JSON only with project, design, pages, sections, features, content, responsive, and files.html/css/js.
files must be complete polished client-side website code — not a basic template.`

    const rawText = await callOpenRouter({
      apiKey,
      model: BUILDER_MODEL,
      system: BUILDER_SYSTEM,
      user: prompt,
    })

    let parsed: Record<string, unknown> = {}
    try {
      parsed = extractJson(rawText)
    } catch {
      parsed = {}
    }

    void WEBSITE_JSON_SCHEMA

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
        secondary: designBlock.secondaryColor,
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
          fontDirection: designBlock.fontDirection || 'display + clean body sans',
          visualDirection: designBlock.visualDirection || chosenStyle,
        },
        pages: Array.isArray(parsed.pages) ? parsed.pages : ['Home'],
        sections: Array.isArray(parsed.sections)
          ? parsed.sections
          : ['Hero', 'About', 'Work', 'Contact'],
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
      model: BUILDER_MODEL,
    })
  } catch (err: unknown) {
    console.error('NYVEN /api/build error:', err)
    let userMessage = 'NYVEN could not finish building this website. Please try again.'
    let status = 500
    if (err && typeof err === 'object') {
      const anyErr = err as { message?: string; status?: number; name?: string }
      const msg = String(anyErr.message || '').toLowerCase()
      if (anyErr.name === 'AbortError' || msg.includes('abort') || msg.includes('timeout')) {
        userMessage = 'NYVEN Builder timed out while generating this website. Please try again.'
      } else if (anyErr.status === 401 || anyErr.status === 403 || msg.includes('api key') || msg.includes('auth')) {
        userMessage = 'NYVEN Builder is temporarily unavailable. Please try again later.'
        status = 503
      } else if (anyErr.status === 429 || msg.includes('rate') || msg.includes('quota')) {
        userMessage =
          "NYVEN Builder is receiving many requests right now. Please wait a moment and try again."
        status = 429
      }
    }
    return res.status(status).json({ success: false, error: userMessage })
  }
        }
