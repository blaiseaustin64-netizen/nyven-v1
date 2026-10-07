/**
 * POST /api/agent/chat
 * Real agent chat + knowledge retrieval (keyword scoring — not vector search).
 * Reuses NYVEN Gemini routing. No API keys in responses.
 */

interface Env {
  GEMINI_API_KEY: string
  GEMINI_CHAT_MODEL?: string
  GEMINI_AGENT_MODEL?: string
}

interface AgentRuntimeConfig {
  id: string
  agentType: string
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
  personality: string
  tone: string
  communicationStyle: string
  instructions: string
  goals: string
  behaviorRules: string
  restrictions: string
  escalationRules: string
  status: string
}

interface KnowledgeItem {
  id: string
  type: string
  title: string
  content: string
  answer?: string
  category?: string
  status: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function registryKey(agentId: string): Request {
  return new Request(
    `https://nyven-agent-registry.internal/v1/${encodeURIComponent(agentId)}`
  )
}

function mapGeminiError(status: number, message: string): { status: number; error: string } {
  const msg = message.toLowerCase()
  if (
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests')
  ) {
    return {
      status: 429,
      error:
        "NYVEN's AI service is temporarily unavailable because the current model quota has been reached. Please try again later.",
    }
  }
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api key') ||
    msg.includes('permission') ||
    msg.includes('unauthenticated') ||
    msg.includes('unauthorized')
  ) {
    return { status: 503, error: 'NYVEN is temporarily unavailable. Please try again later.' }
  }
  if (
    status >= 500 ||
    msg.includes('unavailable') ||
    msg.includes('internal') ||
    msg.includes('deadline') ||
    msg.includes('timeout')
  ) {
    return {
      status: 503,
      error: 'NYVEN is temporarily unavailable. Please try again in a moment.',
    }
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('prohibited')) {
    return {
      status: 400,
      error: 'I cannot respond to that request. Please try a different question.',
    }
  }
  return { status: 500, error: 'Something went wrong. Please try again.' }
}

/** Lightweight keyword retrieval — NOT semantic/vector search. Upgrade path: embeddings. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function scoreKnowledge(query: string, item: KnowledgeItem): number {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return 0
  const hay = [
    item.title,
    item.content,
    item.answer || '',
    item.category || '',
  ]
    .join(' ')
    .toLowerCase()
  const hTokens = tokenize(hay)
  if (hTokens.length === 0) return 0

  let hits = 0
  for (const t of qTokens) {
    if (hay.includes(t)) hits += 1
  }
  // Title matches weigh more
  const titleLower = (item.title || '').toLowerCase()
  for (const t of qTokens) {
    if (titleLower.includes(t)) hits += 1.5
  }
  return hits / qTokens.size
}

const MAX_KNOWLEDGE_ITEMS = 6
const MIN_SCORE = 0.15

function retrieveKnowledge(
  query: string,
  items: KnowledgeItem[]
): { selected: KnowledgeItem[]; scores: Record<string, number> } {
  const active = items.filter((k) => k.status === 'active' || !k.status)
  if (active.length === 0) return { selected: [], scores: {} }

  const scored = active
    .map((item) => ({ item, score: scoreKnowledge(query, item) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KNOWLEDGE_ITEMS)

  // If nothing matched but knowledge exists and query is short, include top FAQs lightly
  if (scored.length === 0 && active.length > 0 && query.trim().length < 12) {
    return { selected: [], scores: {} }
  }

  const scores: Record<string, number> = {}
  for (const s of scored) scores[s.item.id] = s.score
  return { selected: scored.map((s) => s.item), scores }
}

function formatKnowledgeBlock(items: KnowledgeItem[]): string {
  if (items.length === 0) return ''
  const parts: string[] = [
    '=== BUSINESS KNOWLEDGE (use only this for business-specific facts) ===',
  ]
  for (const k of items) {
    if (k.type === 'faq') {
      parts.push(`FAQ [${k.category || 'general'}]: Q: ${k.title}`)
      parts.push(`A: ${k.answer || k.content}`)
    } else {
      parts.push(`Info — ${k.title}:`)
      parts.push(k.content)
    }
    parts.push('')
  }
  parts.push('=== END KNOWLEDGE ===')
  return parts.join('\n')
}

function buildAgentSystemInstruction(
  cfg: AgentRuntimeConfig,
  knowledgeBlock: string,
  hasKnowledgeMatch: boolean
): string {
  const name = (cfg.name || 'Support Agent').trim()
  const lines: string[] = [
    `You are ${name}, a specialized NYVEN agent.`,
    '',
    'You are powered by NYVEN, an intelligence platform created by VEXDYN.',
    'You are NOT Gemini, Google, OpenRouter, or any other underlying model provider.',
    '',
  ]

  if (cfg.personality?.trim()) {
    lines.push('Personality:', cfg.personality.trim(), '')
  }
  if (cfg.tone?.trim()) lines.push(`Tone: ${cfg.tone.trim()}`)
  if (cfg.communicationStyle?.trim()) {
    lines.push(`Communication style: ${cfg.communicationStyle.trim()}`)
  }
  if (cfg.tone?.trim() || cfg.communicationStyle?.trim()) lines.push('')

  if (cfg.instructions?.trim()) {
    lines.push('Main instructions:', cfg.instructions.trim(), '')
  }
  if (cfg.goals?.trim()) lines.push('Goals:', cfg.goals.trim(), '')
  if (cfg.behaviorRules?.trim()) {
    lines.push('Behavior rules:', cfg.behaviorRules.trim(), '')
  }
  if (cfg.restrictions?.trim()) {
    lines.push('Restrictions — you must follow these:', cfg.restrictions.trim(), '')
  }
  if (cfg.escalationRules?.trim()) {
    lines.push('Escalation rules:', cfg.escalationRules.trim(), '')
  }

  lines.push(
    'ANTI-HALLUCINATION RULES (mandatory):',
    '- For business-specific facts (prices, policies, hours, products, shipping, refunds, contact details), use ONLY the BUSINESS KNOWLEDGE section when provided.',
    '- If the knowledge section is empty or does not cover the question, do NOT invent company-specific facts.',
    '- When you lack knowledge, follow escalation rules or say you do not have that information and offer to connect the visitor with the team.',
    '- Never invent refund policies, legal claims, or internal system details.',
    ''
  )

  if (knowledgeBlock) {
    lines.push(knowledgeBlock, '')
    if (hasKnowledgeMatch) {
      lines.push(
        'Relevant knowledge was retrieved for this question. Prefer it for factual answers.',
        ''
      )
    }
  } else {
    lines.push(
      'No matching business knowledge was retrieved for this message. Do not invent business facts.',
      ''
    )
  }

  lines.push(
    'Respond helpfully and stay in character. Keep answers clear and appropriately concise.'
  )
  return lines.join('\n')
}

function sanitizeConfig(raw: unknown): AgentRuntimeConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id.trim() || o.id.length > 128) return null
  if (typeof o.name !== 'string') return null
  const str = (v: unknown, fallback = '') =>
    typeof v === 'string' ? v.slice(0, 8000) : fallback
  return {
    id: o.id.trim(),
    agentType: str(o.agentType, 'support'),
    name: str(o.name, 'Agent').slice(0, 120),
    description: str(o.description).slice(0, 500),
    avatar: str(o.avatar, 'N').slice(0, 8),
    color: str(o.color, '#62E6FF').slice(0, 20),
    welcomeMessage: str(o.welcomeMessage).slice(0, 500),
    personality: str(o.personality),
    tone: str(o.tone, 'Professional'),
    communicationStyle: str(o.communicationStyle, 'Conversational'),
    instructions: str(o.instructions),
    goals: str(o.goals),
    behaviorRules: str(o.behaviorRules),
    restrictions: str(o.restrictions),
    escalationRules: str(o.escalationRules),
    status: str(o.status, 'active'),
  }
}

function sanitizeKnowledgeList(raw: unknown): KnowledgeItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((k) => k && typeof k === 'object')
    .slice(0, 200)
    .map((k) => {
      const o = k as Record<string, unknown>
      return {
        id: String(o.id || '').slice(0, 64),
        type: String(o.type || 'text').slice(0, 16),
        title: String(o.title || '').slice(0, 200),
        content: String(o.content || '').slice(0, 12000),
        answer: o.answer ? String(o.answer).slice(0, 12000) : undefined,
        category: o.category ? String(o.category).slice(0, 100) : undefined,
        status: String(o.status || 'active').slice(0, 16),
      }
    })
    .filter((k) => k.id && k.title)
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 60_000
/** Multi-level limits (in-isolate foundation; durable store later) */
const LIMITS = {
  session: 25,
  ip: 60,
  agent: 120,
}

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

function extractOriginHost(request: Request): string | null {
  const origin = request.headers.get('Origin')
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase()
    } catch { /* ignore */ }
  }
  const referer = request.headers.get('Referer')
  if (referer) {
    try {
      return new URL(referer).hostname.toLowerCase()
    } catch { /* ignore */ }
  }
  return null
}

function hostMatchesAllowlist(host: string, allowed: string[]): boolean {
  if (!host) return false
  for (const d of allowed) {
    const domain = d.toLowerCase()
    if (host === domain) return true
    if (host.endsWith('.' + domain)) return true
  }
  return false
}

async function loadPublished(
  agentId: string
): Promise<{
  config: AgentRuntimeConfig | null
  knowledge: KnowledgeItem[]
  allowedDomains: string[]
  domainRestrictionEnabled: boolean
  skills: unknown
  guardrails: unknown
}> {
  try {
    const cache = caches.default
    const cached = await cache.match(registryKey(agentId))
    if (!cached) {
      return {
        config: null,
        knowledge: [],
        allowedDomains: [],
        domainRestrictionEnabled: false,
        skills: null,
        guardrails: null,
      }
    }
    const raw = (await cached.json()) as Record<string, unknown>
    const allowedDomains = Array.isArray(raw.allowedDomains)
      ? (raw.allowedDomains as unknown[])
          .filter((d) => typeof d === 'string')
          .map((d) => String(d).toLowerCase())
      : []
    return {
      config: sanitizeConfig(raw),
      knowledge: sanitizeKnowledgeList(raw.knowledge),
      allowedDomains,
      domainRestrictionEnabled: !!raw.domainRestrictionEnabled && allowedDomains.length > 0,
      skills: raw.skills ?? null,
      guardrails: raw.guardrails ?? null,
    }
  } catch {
    return {
      config: null,
      knowledge: [],
      allowedDomains: [],
      domainRestrictionEnabled: false,
      skills: null,
      guardrails: null,
    }
  }
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return jsonResponse({}, 204)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  try {
    const body = (await request.json()) as {
      agentId?: string
      message?: string
      history?: ChatMessage[]
      sessionId?: string
      conversationId?: string
      config?: unknown
      knowledge?: unknown
    }

    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const sessionId =
      typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 128) : ''

    if (!agentId || agentId.length > 128) {
      return jsonResponse({ success: false, error: 'Valid agentId is required.' }, 400)
    }
    if (!message) {
      return jsonResponse({ success: false, error: 'Message is required.' }, 400)
    }
    if (message.length > 8000) {
      return jsonResponse({ success: false, error: 'Message is too long.' }, 400)
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown'
    if (!checkRateLimit(`sess:${agentId}:${sessionId || clientIp}`, LIMITS.session)) {
      return jsonResponse(
        { success: false, error: 'Too many messages from this session. Please wait a moment.' },
        429
      )
    }
    if (!checkRateLimit(`ip:${clientIp}`, LIMITS.ip)) {
      return jsonResponse(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        429
      )
    }
    if (!checkRateLimit(`agent:${agentId}`, LIMITS.agent)) {
      return jsonResponse(
        { success: false, error: 'This agent is receiving too many requests. Please try again shortly.' },
        429
      )
    }

    let config = sanitizeConfig(body.config)
    if (config && config.id !== agentId) {
      return jsonResponse({ success: false, error: 'Agent id mismatch.' }, 400)
    }

    let knowledgePool: KnowledgeItem[] = sanitizeKnowledgeList(body.knowledge)
    const published = await loadPublished(agentId)
    if (!config) config = published.config
    if (knowledgePool.length === 0) knowledgePool = published.knowledge

    if (!config) {
      return jsonResponse(
        {
          success: false,
          error:
            'Agent configuration not found. Save and publish the agent in NYVEN first.',
        },
        404
      )
    }

    if (config.status === 'paused') {
      return jsonResponse(
        {
          success: false,
          error: 'This agent is paused and is not accepting messages right now.',
        },
        403
      )
    }
    if (config.status === 'draft' && !body.config) {
      return jsonResponse(
        {
          success: false,
          error: 'This agent is still a draft. Activate it before using the website widget.',
        },
        403
      )
    }

    // Domain allowlist: enforced when owner has published at least one domain.
    // Playground sends config in body and is treated as owner console (skip domain).
    const isPlayground = !!body.config
    if (!isPlayground && published.domainRestrictionEnabled) {
      const host = extractOriginHost(request)
      if (!host || !hostMatchesAllowlist(host, published.allowedDomains)) {
        return jsonResponse(
          {
            success: false,
            error: 'This agent is not available on this website.',
          },
          403
        )
      }
    }

    const { selected } = retrieveKnowledge(message, knowledgePool)
    const knowledgeUsed = selected.length > 0
    const knowledgeGap = !knowledgeUsed && knowledgePool.length > 0
    const knowledgeBlock = formatKnowledgeBlock(selected)

    // Skills + guardrails from publish registry (when present)
    let extraContext = ''
    if (Array.isArray(published.skills) && published.skills.length > 0) {
      const enabled = (published.skills as any[]).filter((s) => s && s.enabled !== false)
      if (enabled.length) {
        extraContext +=
          '\nEnabled skills:\n' +
          enabled
            .map((s) => `- ${s.label || s.id || 'skill'}: ${s.description || ''}`)
            .join('\n') +
          '\n'
      }
    }
    if (published.guardrails && typeof published.guardrails === 'object') {
      const g = published.guardrails as Record<string, string>
      const gl: string[] = ['\nGuardrails:']
      for (const key of [
        'topicsToAvoid',
        'mustNotInvent',
        'whenToSayUnknown',
        'whenToEscalate',
        'restrictedActions',
        'responseBoundaries',
      ]) {
        if (g[key] && String(g[key]).trim()) gl.push(`${key}: ${String(g[key]).trim()}`)
      }
      if (gl.length > 1) extraContext += gl.join('\n') + '\n'
    }

    const systemInstruction =
      buildAgentSystemInstruction(config, knowledgeBlock, knowledgeUsed) + extraContext

    const apiKey = env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured')
      return jsonResponse(
        {
          success: false,
          error: 'NYVEN is temporarily unavailable. Please try again later.',
        },
        500
      )
    }

    const CHAT_MODEL =
      env.GEMINI_AGENT_MODEL || env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
    if (Array.isArray(body.history) && body.history.length > 0) {
      for (const m of body.history.slice(-20)) {
        if (
          m &&
          typeof m.content === 'string' &&
          m.content.trim() &&
          (m.role === 'user' || m.role === 'assistant')
        ) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content.slice(0, 8000) }],
          })
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
        }),
      }
    )

    const data = (await geminiRes.json().catch(() => ({}))) as Record<string, any>
    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || `Gemini error (${geminiRes.status})`
      console.error('NYVEN /api/agent/chat Gemini error:', errMsg)
      const mapped = mapGeminiError(geminiRes.status, errMsg)
      return jsonResponse({ success: false, error: mapped.error }, mapped.status)
    }

    const finalText: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''

    if (!finalText.trim()) {
      return jsonResponse(
        {
          success: false,
          error: 'The agent could not generate a response. Please try again.',
        },
        500
      )
    }

    return jsonResponse(
      {
        success: true,
        message: finalText.trim(),
        agentId: config.id,
        agentName: config.name,
        knowledgeUsed,
        knowledgeIds: selected.map((k) => k.id),
        knowledgeGap: knowledgeGap || (!knowledgeUsed && knowledgePool.length === 0),
        // scores omitted from public response detail — keep minimal
        retrieval: 'keyword', // honest: not vector search
      },
      200
    )
  } catch (err: unknown) {
    console.error('NYVEN /api/agent/chat error:', err)
    return jsonResponse(
      { success: false, error: 'Something went wrong. Please try again.' },
      500
    )
  }
}
