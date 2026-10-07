/**
 * POST /api/agent/publish
 * Publishes agent runtime config + knowledge to the registry (Cloudflare Cache API).
 * No Supabase yet — replace with durable DB when available.
 */

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

interface PublishedKnowledgeItem {
  id: string
  type: string
  title: string
  content: string
  answer?: string
  category?: string
  status: string
}

interface Env {
  GEMINI_API_KEY?: string
}

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

function isValidConfig(c: unknown): c is AgentRuntimeConfig {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    o.id.length < 128 &&
    typeof o.name === 'string' &&
    typeof o.status === 'string'
  )
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return jsonResponse({}, 204)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      config?: unknown
      knowledge?: unknown
    }
    if (!isValidConfig(body.config)) {
      return jsonResponse({ success: false, error: 'Invalid agent configuration.' }, 400)
    }

    const config = body.config
    let knowledge: PublishedKnowledgeItem[] = []
    if (Array.isArray(body.knowledge)) {
      knowledge = body.knowledge
        .filter((k): k is PublishedKnowledgeItem => {
          if (!k || typeof k !== 'object') return false
          const o = k as Record<string, unknown>
          return typeof o.id === 'string' && typeof o.title === 'string'
        })
        .slice(0, 200)
        .map((k) => ({
          id: String(k.id).slice(0, 64),
          type: String(k.type || 'text').slice(0, 16),
          title: String(k.title).slice(0, 200),
          content: String(k.content || '').slice(0, 12000),
          answer: k.answer ? String(k.answer).slice(0, 12000) : undefined,
          category: k.category ? String(k.category).slice(0, 100) : undefined,
          status: String(k.status || 'active').slice(0, 16),
        }))
        .filter((k) => k.status === 'active')
    }

    let allowedDomains: string[] = []
    if (Array.isArray((body as any).allowedDomains)) {
      allowedDomains = (body as any).allowedDomains
        .filter((d: unknown) => typeof d === 'string')
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 200)
    }
    const domainRestrictionEnabled = allowedDomains.length > 0

    let skills: unknown[] = []
    if (Array.isArray((body as any).skills)) skills = (body as any).skills.slice(0, 50)
    let guardrails: unknown = (body as any).guardrails || null

    const payload = JSON.stringify({
      ...config,
      knowledge,
      allowedDomains,
      domainRestrictionEnabled,
      skills,
      guardrails,
      publishedAt: new Date().toISOString(),
    })

    const cache = caches.default
    await cache.put(
      registryKey(config.id),
      new Response(payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=604800',
        },
      })
    )

    return jsonResponse(
      { success: true, agentId: config.id, knowledgeCount: knowledge.length },
      200
    )
  } catch (err) {
    console.error('NYVEN /api/agent/publish error:', err)
    return jsonResponse({ success: false, error: 'Failed to publish agent.' }, 500)
  }
}
