/**
 * GET /api/public-config
 * Exposes only public client config (Supabase URL + anon key).
 * Never returns service role, OAuth secrets, or connector tokens.
 *
 * Lets the SPA initialize auth when VITE_* vars were not present at build time
 * (common on Cloudflare Pages if only Functions secrets are set).
 */

interface Env {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''

  if (!url || !anon || !url.startsWith('http')) {
    return json(
      {
        success: false,
        configured: false,
        error:
          'Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) on Cloudflare Pages.',
      },
      503
    )
  }

  return json(
    {
      success: true,
      configured: true,
      supabaseUrl: url,
      supabaseAnonKey: anon,
    },
    200
  )
}
