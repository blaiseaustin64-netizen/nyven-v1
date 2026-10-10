/**
 * Read-only GitHub REST helpers for NYVEN Code (repo metadata, branches, contents, issues, PRs).
 * Server-only. Tokens are passed in per call and are never placed in results or errors.
 * Workers-compatible: fetch, AbortController, atob, TextDecoder only.
 */

const GITHUB_API = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 10_000

/** Hard cap for inline file content. Larger files return metadata only. */
export const MAX_INLINE_FILE_BYTES = 512 * 1024

const OWNER_OR_REPO = /^[A-Za-z0-9_.-]{1,100}$/
const REF_NAME = /^[A-Za-z0-9._/-]{1,255}$/

export type ApiFailure = {
  ok: false
  status: number
  code: string
  error: string
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure

/* ─── Input validation ─────────────────────────────────────── */

export function isValidOwnerOrRepo(value: string): boolean {
  return OWNER_OR_REPO.test(value) && value !== '.' && value !== '..'
}

export function isValidRef(ref: string): boolean {
  if (!REF_NAME.test(ref)) return false
  if (ref.includes('..') || ref.includes('//')) return false
  if (ref.startsWith('/') || ref.endsWith('/') || ref.endsWith('.lock')) return false
  return true
}

/** Normalize a repository-relative path. Rejects traversal, control characters and backslashes. */
export function normalizeRepoPath(raw: string): { ok: true; path: string } | { ok: false; error: string } {
  if (raw.length > 1024) return { ok: false, error: 'Path is too long.' }
  if (/[\\\x00-\x1f]/.test(raw)) return { ok: false, error: 'Path contains invalid characters.' }
  const segments = raw.split('/').filter((s) => s.length > 0)
  if (segments.some((s) => s === '.' || s === '..')) {
    return { ok: false, error: 'Path must not contain . or .. segments.' }
  }
  return { ok: true, path: segments.join('/') }
}

export function parsePageParams(url: URL, defaultPerPage = 30): { page: number; perPage: number } {
  const page = Math.min(Math.max(Number(url.searchParams.get('page') || '1') || 1, 1), 100)
  const perPage = Math.min(Math.max(Number(url.searchParams.get('per_page') || defaultPerPage) || defaultPerPage, 1), 100)
  return { page, perPage }
}

/* ─── GitHub request with safe error mapping ───────────────── */

export async function githubGet(
  token: string,
  path: string,
  query?: Record<string, string | number>
): Promise<ApiResult<unknown>> {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
    : ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${GITHUB_API}${path}${qs}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NYVEN',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    })
  } catch {
    return {
      ok: false,
      status: 502,
      code: 'GITHUB_UNAVAILABLE',
      error: 'GitHub could not be reached. Try again shortly.',
    }
  } finally {
    clearTimeout(timer)
  }

  if (res.ok) {
    try {
      return { ok: true, data: await res.json() }
    } catch {
      return { ok: false, status: 502, code: 'GITHUB_UNAVAILABLE', error: 'GitHub returned an unreadable response.' }
    }
  }
  return mapGitHubFailure(res)
}

export function mapGitHubFailure(res: Response): ApiFailure {
  const rateLimited =
    res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
  if (rateLimited) {
    return {
      ok: false,
      status: 429,
      code: 'GITHUB_RATE_LIMIT',
      error: 'GitHub rate limit reached. Try again later.',
    }
  }
  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      code: 'GITHUB_AUTH',
      error: 'GitHub no longer accepts the stored authorization. Reconnect GitHub.',
    }
  }
  if (res.status === 403) {
    return {
      ok: false,
      status: 403,
      code: 'GITHUB_FORBIDDEN',
      error: 'Your GitHub account does not have access to this resource, or the app lacks that permission.',
    }
  }
  if (res.status === 404) {
    return {
      ok: false,
      status: 404,
      code: 'GITHUB_NOT_FOUND',
      error: 'Not found, or your GitHub account cannot access it.',
    }
  }
  return {
    ok: false,
    status: 502,
    code: 'GITHUB_UNAVAILABLE',
    error: `GitHub returned an error (${res.status}). Try again shortly.`,
  }
}

/* ─── Mappers (only fields the workspace needs) ────────────── */

type RawRepo = Record<string, unknown>

export function mapRepoDetail(r: RawRepo) {
  const perms = (r.permissions as Record<string, unknown> | undefined) || {}
  return {
    name: String(r.name ?? ''),
    full_name: String(r.full_name ?? ''),
    owner: String((r.owner as { login?: string } | undefined)?.login ?? ''),
    private: r.private === true,
    description: (r.description as string | null) ?? null,
    default_branch: String(r.default_branch ?? 'main'),
    html_url: String(r.html_url ?? ''),
    language: (r.language as string | null) ?? null,
    archived: r.archived === true,
    stargazers_count: Number(r.stargazers_count ?? 0),
    forks_count: Number(r.forks_count ?? 0),
    open_issues_count: Number(r.open_issues_count ?? 0),
    pushed_at: (r.pushed_at as string | null) ?? null,
    updated_at: (r.updated_at as string | null) ?? null,
    // Read-only view of what the granted token can do. NYVEN Code does not write in this phase.
    permissions: {
      pull: perms.pull === true,
      push: perms.push === true,
      admin: perms.admin === true,
    },
  }
}

export function mapBranch(b: RawRepo) {
  const commit = (b.commit as { sha?: string } | undefined) || {}
  return {
    name: String(b.name ?? ''),
    protected: b.protected === true,
    sha: String(commit.sha ?? ''),
  }
}

export type ContentEntry = {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'submodule' | 'other'
  size: number
  sha: string
  html_url: string | null
}

export function mapContentEntry(e: RawRepo): ContentEntry {
  const t = String(e.type ?? '')
  const type: ContentEntry['type'] =
    t === 'file' || t === 'dir' || t === 'symlink' || t === 'submodule' ? t : 'other'
  return {
    name: String(e.name ?? ''),
    path: String(e.path ?? ''),
    type,
    size: Number(e.size ?? 0),
    sha: String(e.sha ?? ''),
    html_url: (e.html_url as string | null) ?? null,
  }
}

export function mapIssue(i: RawRepo) {
  return {
    number: Number(i.number ?? 0),
    title: String(i.title ?? ''),
    state: String(i.state ?? ''),
    author: String((i.user as { login?: string } | undefined)?.login ?? ''),
    labels: Array.isArray(i.labels)
      ? (i.labels as Array<{ name?: string; color?: string }>).map((l) => ({
          name: String(l.name ?? ''),
          color: String(l.color ?? ''),
        }))
      : [],
    comments: Number(i.comments ?? 0),
    created_at: String(i.created_at ?? ''),
    updated_at: String(i.updated_at ?? ''),
    html_url: String(i.html_url ?? ''),
  }
}

export function mapPull(p: RawRepo) {
  const head = (p.head as { ref?: string } | undefined) || {}
  const base = (p.base as { ref?: string } | undefined) || {}
  return {
    number: Number(p.number ?? 0),
    title: String(p.title ?? ''),
    state: String(p.state ?? ''),
    draft: p.draft === true,
    merged: Boolean(p.merged_at),
    author: String((p.user as { login?: string } | undefined)?.login ?? ''),
    head: String(head.ref ?? ''),
    base: String(base.ref ?? ''),
    created_at: String(p.created_at ?? ''),
    updated_at: String(p.updated_at ?? ''),
    html_url: String(p.html_url ?? ''),
  }
}

/* ─── File content decoding ────────────────────────────────── */

export type FileView =
  | { encoding: 'utf-8'; content: string }
  | { encoding: 'binary' }
  | { encoding: 'too_large' }

/** Decode GitHub's base64 contents payload. Binary files are detected by a NUL byte in the first 8 KB. */
export function decodeFileContent(base64: string, size: number): FileView {
  if (size > MAX_INLINE_FILE_BYTES) return { encoding: 'too_large' }
  const clean = base64.replace(/\s+/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const probe = Math.min(bytes.length, 8192)
  for (let i = 0; i < probe; i++) {
    if (bytes[i] === 0) return { encoding: 'binary' }
  }
  return { encoding: 'utf-8', content: new TextDecoder('utf-8', { fatal: false }).decode(bytes) }
}

/** Parse and validate ?owner= & ?repo= from a request URL. */
export function parseOwnerRepo(url: URL): { ok: true; owner: string; repo: string } | { ok: false; error: string } {
  const owner = url.searchParams.get('owner') || ''
  const repo = url.searchParams.get('repo') || ''
  if (!isValidOwnerOrRepo(owner) || !isValidOwnerOrRepo(repo)) {
    return { ok: false, error: 'A valid owner and repository name are required.' }
  }
  return { ok: true, owner, repo }
}

export function repoApiPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}
