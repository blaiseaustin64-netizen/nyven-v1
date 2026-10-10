/**
 * Browser client for the NYVEN Code GitHub routes. All calls go through the NYVEN server;
 * the browser never holds a GitHub token and never calls api.github.com directly.
 */
import { authHeaders } from '../connectors/githubApi'
import { buildQuery } from './codeState'

export type CodeResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string }

export type RepoSummary = {
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

export type RepoDetail = {
  name: string
  full_name: string
  owner: string
  private: boolean
  description: string | null
  default_branch: string
  html_url: string
  language: string | null
  archived: boolean
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  pushed_at: string | null
  updated_at: string | null
  permissions: { pull: boolean; push: boolean; admin: boolean }
}

export type Branch = { name: string; protected: boolean; sha: string }

export type ContentEntry = {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'submodule' | 'other'
  size: number
  sha: string
  html_url: string | null
}

export type FileView = { encoding: 'utf-8'; content: string } | { encoding: 'binary' } | { encoding: 'too_large' }

export type ContentsResponse =
  | { kind: 'dir'; path: string; ref: string | null; entries: ContentEntry[] }
  | { kind: 'file'; path: string; ref: string | null; entry: ContentEntry; file: FileView }
  | { kind: 'other'; path: string; ref: string | null; entry: ContentEntry }

export type IssueItem = {
  number: number
  title: string
  state: string
  author: string
  labels: Array<{ name: string; color: string }>
  comments: number
  created_at: string
  updated_at: string
  html_url: string
}

export type PullItem = {
  number: number
  title: string
  state: string
  draft: boolean
  merged: boolean
  author: string
  head: string
  base: string
  created_at: string
  updated_at: string
  html_url: string
}

export const REPO_PAGE_SIZE = 50

async function getJson<T>(path: string): Promise<CodeResult<T>> {
  let res: Response
  try {
    res = await fetch(path, { headers: await authHeaders() })
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', error: 'Could not reach NYVEN. Check your connection and try again.' }
  }
  const body = (await res.json().catch(() => null)) as
    | ({ success?: boolean; code?: string; error?: string } & Record<string, unknown>)
    | null
  if (!res.ok || !body || body.success !== true) {
    return {
      ok: false,
      status: res.status,
      code: body?.code || `HTTP_${res.status}`,
      error: body?.error || 'Request failed.',
    }
  }
  return { ok: true, data: body as unknown as T }
}

export async function fetchRepos(page: number): Promise<CodeResult<RepoSummary[]>> {
  const r = await getJson<{ repos: RepoSummary[] }>(`/api/connectors/github/repos?${buildQuery({ page })}`)
  return r.ok ? { ok: true, data: r.data.repos } : r
}

export async function fetchRepo(owner: string, repo: string): Promise<CodeResult<RepoDetail>> {
  const r = await getJson<{ repo: RepoDetail }>(`/api/connectors/github/repo?${buildQuery({ owner, repo })}`)
  return r.ok ? { ok: true, data: r.data.repo } : r
}

export async function fetchBranches(owner: string, repo: string, page = 1) {
  return getJson<{ branches: Branch[]; has_more: boolean }>(
    `/api/connectors/github/branches?${buildQuery({ owner, repo, page, per_page: 100 })}`
  )
}

export async function fetchContents(
  owner: string,
  repo: string,
  ref: string | undefined,
  path: string
): Promise<CodeResult<ContentsResponse>> {
  const r = await getJson<ContentsResponse>(
    `/api/connectors/github/contents?${buildQuery({ owner, repo, ref, path })}`
  )
  return r.ok ? { ok: true, data: r.data } : r
}

export async function fetchIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all', page = 1) {
  return getJson<{ items: IssueItem[]; has_more: boolean }>(
    `/api/connectors/github/issues?${buildQuery({ owner, repo, state, page })}`
  )
}

export async function fetchPulls(owner: string, repo: string, state: 'open' | 'closed' | 'all', page = 1) {
  return getJson<{ items: PullItem[]; has_more: boolean }>(
    `/api/connectors/github/pulls?${buildQuery({ owner, repo, state, page })}`
  )
}
