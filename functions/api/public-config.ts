/**
 * GET /api/public-config — public client bootstrap (no secrets).
 */

interface Env {
  APP_URL?: string
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })

export const onRequestGet: PagesFunction<Env> = async () => {
  return json(
    {
      success: true,
      configured: true,
      auth: 'cloudflare',
      features: {
        emailPassword: true,
        githubOAuthLogin: false,
      },
    },
    200
  )
}
