/**
 * Browser Supabase client.
 * Prefer VITE_* build-time vars; if missing, load public config from /api/public-config
 * so Cloudflare Pages deployments that only set Functions env still get auth.
 * Service role keys must NEVER appear here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const buildUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''
const buildAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || ''

let runtimeUrl: string | null = null
let runtimeAnon: string | null = null
let client: SupabaseClient | null = null
let bootstrapPromise: Promise<boolean> | null = null

function resolvedUrl(): string {
  return (runtimeUrl || buildUrl || '').replace(/\/$/, '')
}

function resolvedAnon(): string {
  return runtimeAnon || buildAnon || ''
}

export function isSupabaseConfigured(): boolean {
  const url = resolvedUrl()
  const anon = resolvedAnon()
  return Boolean(url && anon && url.startsWith('http'))
}

/**
 * Ensure public Supabase config is available (build-time or runtime).
 * Safe to call multiple times; concurrent callers share one fetch.
 */
export async function ensureSupabaseConfig(): Promise<boolean> {
  if (isSupabaseConfigured()) return true
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    try {
      const res = await fetch('/api/public-config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        configured?: boolean
        supabaseUrl?: string
        supabaseAnonKey?: string
      }
      if (
        res.ok &&
        data.success &&
        data.supabaseUrl &&
        data.supabaseAnonKey &&
        data.supabaseUrl.startsWith('http')
      ) {
        runtimeUrl = data.supabaseUrl.replace(/\/$/, '')
        runtimeAnon = data.supabaseAnonKey
        client = null
        return true
      }
      return false
    } catch {
      return false
    }
  })()

  return bootstrapPromise
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(resolvedUrl(), resolvedAnon(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
