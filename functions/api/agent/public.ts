/**
 * GET /api/agent/public?id=AGENT_ID
 * Returns safe public identity for the website widget.
 * Never returns Brain/instructions/secrets.
 */

interface Env {
  GEMINI_API_KEY?: string
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

function registryKey(agentId: string): Request {
  return new Request(`https://nyven-agent-registry.internal/v1/${encodeURIComponent(agentId)}`)
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return jsonResponse({}, 204)
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url)
    const id = (url.searchParams.get('id') || '').trim()

    if (!id || id.length > 128 || !/^[\w.-]+$/.test(id)) {
      return jsonResponse({ success: false, error: 'Invalid agent id.' }, 400)
    }

    const cache = caches.default
    const cached = await cache.match(registryKey(id))
    if (!cached) {
      return jsonResponse(
        {
          success: false,
          error: 'Agent not found or not published. Save the agent as Active in NYVEN first.',
        },
        404
      )
    }

    const full = (await cached.json()) as Record<string, unknown>
    const status = String(full.status || 'draft')

    // When domain restriction is enabled, only allow public config from approved origins
    if (full.domainRestrictionEnabled && Array.isArray(full.allowedDomains) && (full.allowedDomains as string[]).length > 0) {
      const origin = context.request.headers.get('Origin') || ''
      const referer = context.request.headers.get('Referer') || ''
      let host = ''
      try {
        if (origin) host = new URL(origin).hostname.toLowerCase()
        else if (referer) host = new URL(referer).hostname.toLowerCase()
      } catch { /* ignore */ }
      const allowed = (full.allowedDomains as string[]).map((d) => String(d).toLowerCase())
      const ok =
        host &&
        allowed.some((d) => host === d || host.endsWith('.' + d))
      // Same-origin dashboard (no Origin on some navigations) — allow missing host only if no Origin/Referer (server-side tools)
      if ((origin || referer) && !ok) {
        return jsonResponse(
          { success: false, error: 'This agent is not available on this website.' },
          403
        )
      }
    }

    if (status === 'draft') {
      return jsonResponse(
        { success: false, error: 'This agent is still a draft and is not available on websites.' },
        403
      )
    }

    if (status === 'paused') {
      return jsonResponse(
        {
          success: true,
          agent: {
            id: full.id,
            name: full.name,
            description: full.description || '',
            avatar: full.avatar || 'N',
            color: full.color || '#62E6FF',
            welcomeMessage: full.welcomeMessage || '',
            status: 'paused',
            agentType: full.agentType || 'support',
          },
          paused: true,
        },
        200
      )
    }

    // Safe public surface only
    return jsonResponse(
      {
        success: true,
        agent: {
          id: full.id,
          name: full.name,
          description: full.description || '',
          avatar: full.avatar || 'N',
          color: full.color || '#62E6FF',
          welcomeMessage:
            full.welcomeMessage ||
            `Hi! I'm ${full.name || 'your assistant'}. How can I help you today?`,
          status: 'active',
          agentType: full.agentType || 'support',
        },
      },
      200
    )
  } catch (err) {
    console.error('NYVEN /api/agent/public error:', err)
    return jsonResponse({ success: false, error: 'Failed to load agent.' }, 500)
  }
}
