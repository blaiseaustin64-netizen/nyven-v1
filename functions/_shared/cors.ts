/**
 * CORS helpers — restrict to APP_URL in production; allow * only when APP_URL unset (local).
 */

export type CorsEnv = {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

function allowedOrigins(env: CorsEnv): string[] | null {
  const list: string[] = []
  if (env.APP_URL) {
    try {
      list.push(new URL(env.APP_URL).origin)
    } catch {
      /* ignore invalid */
    }
  }
  if (env.ALLOWED_ORIGINS) {
    for (const part of env.ALLOWED_ORIGINS.split(',')) {
      const t = part.trim()
      if (t) {
        try {
          list.push(new URL(t).origin)
        } catch {
          list.push(t)
        }
      }
    }
  }
  return list.length ? list : null
}

export function resolveCorsOrigin(request: Request, env: CorsEnv): string {
  const allowed = allowedOrigins(env)
  if (!allowed) return '*'
  const origin = request.headers.get('Origin')
  if (origin && allowed.includes(origin)) return origin
  // Same-origin / non-browser: no Origin header
  if (!origin) return allowed[0]
  return allowed[0]
}

export function corsHeaders(
  request: Request,
  env: CorsEnv,
  methods = 'GET, POST, OPTIONS',
  extraHeaders = 'Content-Type, Authorization'
): Record<string, string> {
  const origin = resolveCorsOrigin(request, env)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': extraHeaders,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  // Required when browser sends credentials: 'include' and origin is not *
  if (origin && origin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return headers
}

export function jsonWithCors(
  request: Request,
  env: CorsEnv,
  body: unknown,
  status: number,
  methods?: string
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env, methods),
    },
  })
}

export function optionsResponse(
  request: Request,
  env: CorsEnv,
  methods = 'GET, POST, OPTIONS',
  extraHeaders = 'Content-Type, Authorization'
): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env, methods, extraHeaders),
  })
}
