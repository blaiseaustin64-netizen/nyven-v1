/**
 * Client helpers for the shared GitHub connector (Settings + NYVEN Code).
 * Never handles raw tokens — server only.
 */

import { getSupabase } from '../supabase/client'
import type { ConnectionPublicRow } from '../supabase/types'

export type GitHubStatusResponse = {
  success: boolean
  configured?: boolean
  connected?: boolean
  connection?: ConnectionPublicRow | null
  error?: string
  code?: string
}

export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: string
  default_branch: string
  html_url: string
  description: string | null
  updated_at: string | null
}

async function authHeaders(): Promise<HeadersInit> {
  const sb = getSupabase()
  const session = sb ? (await sb.auth.getSession()).data.session : null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

export async function fetchGitHubStatus(): Promise<GitHubStatusResponse> {
  const res = await fetch('/api/connectors/github/status', {
    headers: await authHeaders(),
  })
  return (await res.json()) as GitHubStatusResponse
}

export async function startGitHubOAuth(returnTo: string): Promise<{ authorizeUrl: string }> {
  const res = await fetch('/api/connectors/github/start', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ returnTo }),
  })
  const data = (await res.json()) as {
    success?: boolean
    authorizeUrl?: string
    error?: string
  }
  if (!res.ok || !data.authorizeUrl) {
    throw new Error(data.error || 'Could not start GitHub authorization.')
  }
  return { authorizeUrl: data.authorizeUrl }
}

export async function disconnectGitHub(): Promise<void> {
  const res = await fetch('/api/connectors/github/disconnect', {
    method: 'POST',
    headers: await authHeaders(),
  })
  const data = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Could not disconnect GitHub.')
  }
}

export async function listGitHubRepos(page = 1): Promise<GitHubRepo[]> {
  const res = await fetch(`/api/connectors/github/repos?page=${page}`, {
    headers: await authHeaders(),
  })
  const data = (await res.json()) as {
    success?: boolean
    repos?: GitHubRepo[]
    error?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Could not list repositories.')
  }
  return data.repos || []
}
