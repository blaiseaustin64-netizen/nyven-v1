/**
 * Client helpers for GitHub connector. Session via cookie; never handles raw tokens.
 */

export type ConnectionPublic = {
  id?: string
  provider?: string
  status?: string
  account_label?: string | null
  connected_at?: string | null
}

export type GitHubStatusResponse = {
  success: boolean
  configured?: boolean
  connected?: boolean
  connection?: ConnectionPublic | null
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

export async function authHeaders(): Promise<HeadersInit> {
  return { 'Content-Type': 'application/json' }
}

export async function fetchGitHubStatus(): Promise<GitHubStatusResponse> {
  const res = await fetch('/api/connectors/github/status', {
    headers: await authHeaders(),
    credentials: 'include',
  })
  return (await res.json()) as GitHubStatusResponse
}

export async function startGitHubOAuth(returnTo: string): Promise<{ authorizeUrl: string }> {
  const res = await fetch('/api/connectors/github/start', {
    method: 'POST',
    headers: await authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ returnTo }),
  })
  const data = (await res.json()) as {
    success?: boolean
    authorizeUrl?: string
    error?: string
  }
  if (!res.ok || !data.authorizeUrl) {
    throw new Error(data.error || 'Could not start GitHub OAuth.')
  }
  return { authorizeUrl: data.authorizeUrl }
}

export async function disconnectGitHub(): Promise<void> {
  const res = await fetch('/api/connectors/github/disconnect', {
    method: 'POST',
    headers: await authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || 'Disconnect failed.')
  }
}

export async function listGitHubRepos(): Promise<GitHubRepo[]> {
  const res = await fetch('/api/connectors/github/repos', {
    headers: await authHeaders(),
    credentials: 'include',
  })
  const data = (await res.json()) as { success?: boolean; repos?: GitHubRepo[]; error?: string }
  if (!res.ok || !data.success) throw new Error(data.error || 'Could not list repos.')
  return data.repos || []
}
