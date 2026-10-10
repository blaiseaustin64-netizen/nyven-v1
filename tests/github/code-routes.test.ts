import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN,
  SUPABASE_URL,
  composeRoutes,
  connectedRow,
  fetchCalls,
  fakeSupabase,
  installFetch,
  json,
  makeEnv,
} from './harness.ts'
import {
  decodeFileContent,
  isValidOwnerOrRepo,
  isValidRef,
  mapPull,
  normalizeRepoPath,
  MAX_INLINE_FILE_BYTES,
} from '../../functions/_shared/github/api.ts'
import { onRequestGet as repoGet } from '../../functions/api/connectors/github/repo.ts'
import { onRequestGet as branchesGet } from '../../functions/api/connectors/github/branches.ts'
import { onRequestGet as contentsGet } from '../../functions/api/connectors/github/contents.ts'
import { onRequestGet as issuesGet } from '../../functions/api/connectors/github/issues.ts'
import { onRequestGet as pullsGet } from '../../functions/api/connectors/github/pulls.ts'

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const ANON_KEY = 'anon-test-key'
const VALID_BEARER = 'valid-session-token'
const OWNER = 'octocat'
const REPO = 'hello-world'
const REPO_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

const env = () => makeEnv({ APP_URL: 'https://nyven.example', SUPABASE_ANON_KEY: ANON_KEY })

function authRoute() {
  return (call: { url: string; auth: string | null }) => {
    if (!call.url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return null
    return call.auth === `Bearer ${VALID_BEARER}` ? json({ id: USER_ID }) : json({ message: 'nope' }, 401)
  }
}

function req(path: string, opts: { bearer?: string | null } = {}) {
  const headers: Record<string, string> = {}
  if (opts.bearer !== null) headers.Authorization = `Bearer ${opts.bearer ?? VALID_BEARER}`
  return new Request(`https://nyven.example${path}`, { headers })
}

/** Route for GitHub REST calls under REPO_BASE; first matching responder wins. */
function github(...responders: Array<(url: string) => Response | null>) {
  return (call: { url: string }) => {
    if (!call.url.startsWith('https://api.github.com/')) return null
    for (const r of responders) {
      const out = r(call.url)
      if (out) return out
    }
    return json({ message: 'unexpected github call' }, 599)
  }
}

async function bodyOf(res: Response) {
  return res.text()
}

/* ─── Pure helpers ──────────────────────────────────────────── */

describe('owner / repo / ref / path validation', () => {
  test('accepts ordinary GitHub owner and repository names', () => {
    assert.equal(isValidOwnerOrRepo('octo-cat'), true)
    assert.equal(isValidOwnerOrRepo('my_repo.v2'), true)
  })

  test('rejects traversal, separators, spaces, and empty or oversized names', () => {
    for (const bad of ['..', '.', 'a/b', 'a b', '', 'x'.repeat(101), 'a?b']) {
      assert.equal(isValidOwnerOrRepo(bad), false, `expected rejection of ${JSON.stringify(bad)}`)
    }
  })

  test('accepts plain branch names and rejects ref injection shapes', () => {
    assert.equal(isValidRef('main'), true)
    assert.equal(isValidRef('feature/login-1'), true)
    for (const bad of ['../x', 'a//b', 'x.lock', '/x', 'x/', 'a b', 'a?b=1', '']) {
      assert.equal(isValidRef(bad), false, `expected rejection of ${JSON.stringify(bad)}`)
    }
  })

  test('normalizes repository paths and rejects traversal and control characters', () => {
    assert.deepEqual(normalizeRepoPath('src//app/'), { ok: true, path: 'src/app' })
    assert.deepEqual(normalizeRepoPath(''), { ok: true, path: '' })
    assert.equal(normalizeRepoPath('../etc').ok, false)
    assert.equal(normalizeRepoPath('a/./b').ok, false)
    assert.equal(normalizeRepoPath('a\\b').ok, false)
    assert.equal(normalizeRepoPath('a\x00b').ok, false)
    assert.equal(normalizeRepoPath('a'.repeat(1025)).ok, false)
  })
})

describe('file content decoding', () => {
  test('decodes base64 that GitHub wraps with newlines', () => {
    const b64 = Buffer.from('hello\nworld\n', 'utf8').toString('base64')
    const wrapped = b64.slice(0, 4) + '\n' + b64.slice(4)
    assert.deepEqual(decodeFileContent(wrapped, 12), { encoding: 'utf-8', content: 'hello\nworld\n' })
  })

  test('detects binary files by a NUL byte', () => {
    const b64 = Buffer.from([0x89, 0x50, 0x00, 0x47]).toString('base64')
    assert.deepEqual(decodeFileContent(b64, 4), { encoding: 'binary' })
  })

  test('refuses to inline files above the size cap', () => {
    assert.deepEqual(decodeFileContent('', MAX_INLINE_FILE_BYTES + 1), { encoding: 'too_large' })
  })

  test('maps pull requests, including merged state', () => {
    const merged = mapPull({ number: 3, title: 't', state: 'closed', merged_at: '2026-01-01', head: { ref: 'a' }, base: { ref: 'main' } })
    assert.equal(merged.merged, true)
    assert.equal(merged.head, 'a')
    assert.equal(merged.base, 'main')
  })
})

/* ─── Authentication, validation, and failure gating ────────── */

const ROUTES = [
  { name: 'repo', handler: repoGet, path: `/api/connectors/github/repo?owner=${OWNER}&repo=${REPO}` },
  { name: 'branches', handler: branchesGet, path: `/api/connectors/github/branches?owner=${OWNER}&repo=${REPO}` },
  { name: 'contents', handler: contentsGet, path: `/api/connectors/github/contents?owner=${OWNER}&repo=${REPO}` },
  { name: 'issues', handler: issuesGet, path: `/api/connectors/github/issues?owner=${OWNER}&repo=${REPO}` },
  { name: 'pulls', handler: pullsGet, path: `/api/connectors/github/pulls?owner=${OWNER}&repo=${REPO}` },
]

describe('NYVEN Code routes: authentication and input validation', () => {
  for (const route of ROUTES) {
    test(`${route.name}: requires a signed-in session and makes no GitHub call without one`, async () => {
      installFetch(composeRoutes(authRoute()))
      const res = (await route.handler({ request: req(route.path, { bearer: null }), env: env() } as never)) as Response
      assert.equal(res.status, 401)
      assert.equal(((await res.json()) as { code: string }).code, 'AUTH_REQUIRED')
      assert.equal(fetchCalls().some((c) => c.url.startsWith('https://api.github.com/')), false)
    })

    test(`${route.name}: rejects an invalid session token`, async () => {
      installFetch(composeRoutes(authRoute()))
      const res = (await route.handler({ request: req(route.path, { bearer: 'forged' }), env: env() } as never)) as Response
      assert.equal(res.status, 401)
      assert.equal(fetchCalls().some((c) => c.url.startsWith('https://api.github.com/')), false)
    })

    test(`${route.name}: rejects a malformed owner/repo before any network call`, async () => {
      installFetch(composeRoutes(authRoute()))
      const bad = route.path.replace(`repo=${REPO}`, 'repo=..%2Fsecrets')
      const res = (await route.handler({ request: req(bad), env: env() } as never)) as Response
      assert.equal(res.status, 400)
      assert.equal(fetchCalls().length, 0)
    })

    test(`${route.name}: a failed connection lookup is 503 DB_READ, never a GitHub call`, async () => {
      installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID), 'http500')))
      const res = (await route.handler({ request: req(route.path), env: env() } as never)) as Response
      assert.equal(res.status, 503)
      assert.equal(((await res.json()) as { code: string }).code, 'DB_READ')
      assert.equal(fetchCalls().some((c) => c.url.startsWith('https://api.github.com/')), false)
    })

    test(`${route.name}: a confirmed missing connection is 400 NOT_CONNECTED`, async () => {
      installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
      const res = (await route.handler({ request: req(route.path), env: env() } as never)) as Response
      assert.equal(res.status, 400)
      assert.equal(((await res.json()) as { code: string }).code, 'NOT_CONNECTED')
    })

    test(`${route.name}: each request reads only the requesting user's connection`, async () => {
      installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
      await route.handler({ request: req(route.path), env: env() } as never)
      const read = fetchCalls().find((c) => c.url.startsWith(`${SUPABASE_URL}/rest/v1/connections`))
      assert.ok(read, 'a connection read should be issued')
      assert.ok(read!.url.includes(`user_id=eq.${USER_ID}`))
      assert.ok(!read!.url.includes(OTHER_USER_ID))
    })
  }

  test('state filter rejects unknown values for issues and pulls', async () => {
    installFetch(composeRoutes(authRoute()))
    for (const handler of [issuesGet, pullsGet]) {
      const res = (await handler({
        request: req(`/x?owner=${OWNER}&repo=${REPO}&state=deleted`),
        env: env(),
      } as never)) as Response
      assert.equal(res.status, 400)
    }
  })

  test('contents rejects traversal and malformed refs before any network call', async () => {
    installFetch(composeRoutes(authRoute()))
    const traversal = (await contentsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&path=../secret`), env: env() } as never)) as Response
    const badRef = (await contentsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&ref=a..b`), env: env() } as never)) as Response
    assert.equal(traversal.status, 400)
    assert.equal(badRef.status, 400)
    assert.equal(fetchCalls().length, 0)
  })
})

/* ─── Successful reads and GitHub error mapping ─────────────── */

describe('NYVEN Code routes: GitHub reads', () => {
  test('repo returns metadata and read-only permissions, never the token', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url === REPO_BASE
            ? json({
                name: REPO,
                full_name: `${OWNER}/${REPO}`,
                owner: { login: OWNER },
                private: true,
                description: 'demo',
                default_branch: 'trunk',
                html_url: `https://github.com/${OWNER}/${REPO}`,
                permissions: { pull: true, push: false, admin: false },
              })
            : null
        )
      )
    )
    const res = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    const text = await bodyOf(res)
    assert.equal(res.status, 200)
    const body = JSON.parse(text) as { repo: { default_branch: string; permissions: { push: boolean } } }
    assert.equal(body.repo.default_branch, 'trunk')
    assert.equal(body.repo.permissions.push, false)
    assert.equal(text.includes(ACCESS_TOKEN), false)
  })

  test('the GitHub call carries the user token server-side only', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) => (url.startsWith(REPO_BASE) ? json({ name: REPO, full_name: 'x', owner: { login: OWNER }, permissions: {} }) : null))
      )
    )
    await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)
    const gh = fetchCalls().find((c) => c.url.startsWith('https://api.github.com/'))
    assert.equal(gh?.auth, `Bearer ${ACCESS_TOKEN}`)
  })

  test('branches report has_more when a full page is returned', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url.startsWith(`${REPO_BASE}/branches`)
            ? json([{ name: 'main', protected: true, commit: { sha: 'a' } }, { name: 'dev', protected: false, commit: { sha: 'b' } }])
            : null
        )
      )
    )
    const res = (await branchesGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&per_page=2`), env: env() } as never)) as Response
    const body = (await res.json()) as { branches: Array<{ name: string }>; has_more: boolean }
    assert.deepEqual(body.branches.map((b) => b.name), ['main', 'dev'])
    assert.equal(body.has_more, true)
  })

  test('contents lists directories first, passes the ref, and encodes the path', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url.startsWith(`${REPO_BASE}/contents/src/my%20dir`)
            ? json([
                { name: 'z.ts', path: 'src/my dir/z.ts', type: 'file', size: 4, sha: 's1' },
                { name: 'lib', path: 'src/my dir/lib', type: 'dir', size: 0, sha: 's2' },
              ])
            : null
        )
      )
    )
    const res = (await contentsGet({
      request: req(`/x?owner=${OWNER}&repo=${REPO}&ref=feature/a&path=src/my%20dir`),
      env: env(),
    } as never)) as Response
    const body = (await res.json()) as { kind: string; entries: Array<{ name: string; type: string }> }
    assert.equal(body.kind, 'dir')
    assert.deepEqual(body.entries.map((e) => e.name), ['lib', 'z.ts'])
    const gh = fetchCalls().find((c) => c.url.startsWith('https://api.github.com/'))
    assert.ok(gh!.url.includes('ref=feature%2Fa'))
  })

  test('contents returns decoded text for a file and no token', async () => {
    const b64 = Buffer.from('export const x = 1\n').toString('base64')
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url.startsWith(`${REPO_BASE}/contents/index.ts`)
            ? json({ type: 'file', name: 'index.ts', path: 'index.ts', size: 19, sha: 's', content: b64, encoding: 'base64' })
            : null
        )
      )
    )
    const res = (await contentsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&path=index.ts`), env: env() } as never)) as Response
    const text = await bodyOf(res)
    const body = JSON.parse(text) as { kind: string; file: { encoding: string; content: string } }
    assert.equal(body.kind, 'file')
    assert.equal(body.file.encoding, 'utf-8')
    assert.equal(body.file.content, 'export const x = 1\n')
    assert.equal(text.includes(ACCESS_TOKEN), false)
  })

  test('contents marks binary and oversized files without returning content', async () => {
    const bin = Buffer.from([0, 1, 2, 3]).toString('base64')
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) => {
          if (url.startsWith(`${REPO_BASE}/contents/logo.png`)) {
            return json({ type: 'file', name: 'logo.png', path: 'logo.png', size: 4, sha: 'a', content: bin, encoding: 'base64' })
          }
          if (url.startsWith(`${REPO_BASE}/contents/big.log`)) {
            return json({ type: 'file', name: 'big.log', path: 'big.log', size: 5 * 1024 * 1024, sha: 'b', content: '', encoding: 'none' })
          }
          return null
        })
      )
    )
    const bin1 = (await (await contentsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&path=logo.png`), env: env() } as never) as Response).json()) as { file: { encoding: string } }
    const big = (await (await contentsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&path=big.log`), env: env() } as never) as Response).json()) as { file: { encoding: string; content?: string } }
    assert.equal(bin1.file.encoding, 'binary')
    assert.equal(big.file.encoding, 'too_large')
    assert.equal('content' in big.file, false)
  })

  test('issues exclude pull requests returned by GitHub and pass the state filter', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url.startsWith(`${REPO_BASE}/issues`)
            ? json([
                { number: 1, title: 'bug', state: 'open', user: { login: 'a' }, labels: [{ name: 'bug', color: 'f00' }], comments: 2, created_at: 'c', updated_at: 'u', html_url: 'h' },
                { number: 2, title: 'pr-as-issue', state: 'open', pull_request: { url: 'x' }, user: { login: 'b' }, labels: [], created_at: 'c', updated_at: 'u', html_url: 'h2' },
              ])
            : null
        )
      )
    )
    const res = (await issuesGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&state=all`), env: env() } as never)) as Response
    const body = (await res.json()) as { items: Array<{ number: number }> }
    assert.deepEqual(body.items.map((i) => i.number), [1])
    const gh = fetchCalls().find((c) => c.url.startsWith('https://api.github.com/'))
    assert.ok(gh!.url.includes('state=all'))
  })

  test('pull requests are returned with their state', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github((url) =>
          url.startsWith(`${REPO_BASE}/pulls`)
            ? json([{ number: 7, title: 'feat', state: 'closed', merged_at: 'm', draft: false, user: { login: 'a' }, head: { ref: 'f' }, base: { ref: 'main' }, created_at: 'c', updated_at: 'u', html_url: 'h' }])
            : null
        )
      )
    )
    const res = (await pullsGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}&state=closed`), env: env() } as never)) as Response
    const body = (await res.json()) as { items: Array<{ merged: boolean; head: string }> }
    assert.equal(body.items[0].merged, true)
    assert.equal(body.items[0].head, 'f')
  })

  test('GitHub 404 is surfaced as GITHUB_NOT_FOUND without leaking GitHub details', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID)), github(() => json({ message: 'Not Found' }, 404))))
    const res = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    assert.equal(res.status, 404)
    assert.equal(((await res.json()) as { code: string }).code, 'GITHUB_NOT_FOUND')
  })

  test('GitHub rate limiting is 429 GITHUB_RATE_LIMIT', async () => {
    installFetch(
      composeRoutes(
        authRoute(),
        useSupabaseRouteFor(await connectedRow(USER_ID)),
        github(() => new Response('{}', { status: 403, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0' } }))
      )
    )
    const res = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    assert.equal(res.status, 429)
    assert.equal(((await res.json()) as { code: string }).code, 'GITHUB_RATE_LIMIT')
  })

  test('a revoked GitHub grant (401) is GITHUB_AUTH so the UI can ask to reconnect', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID)), github(() => json({ message: 'Bad credentials' }, 401))))
    const res = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    assert.equal(res.status, 401)
    assert.equal(((await res.json()) as { code: string }).code, 'GITHUB_AUTH')
  })

  test('GitHub outage is 502 GITHUB_UNAVAILABLE, and a network failure is the same', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID)), github(() => json({}, 503))))
    const r1 = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    assert.equal(r1.status, 502)
    assert.equal(((await r1.json()) as { code: string }).code, 'GITHUB_UNAVAILABLE')

    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID)), () => {
      throw new TypeError('network down')
    }))
    const r2 = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
    assert.equal(r2.status, 502)
    assert.equal(((await r2.json()) as { code: string }).code, 'GITHUB_UNAVAILABLE')
  })

  test('no failure response ever contains the access token', async () => {
    const row = await connectedRow(USER_ID)
    for (const status of [500, 401, 404]) {
      installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(row), github(() => json({}, status))))
      const res = (await repoGet({ request: req(`/x?owner=${OWNER}&repo=${REPO}`), env: env() } as never)) as Response
      assert.equal((await bodyOf(res)).includes(ACCESS_TOKEN), false, `status ${status} leaked token`)
    }
  })
})

function useSupabaseRouteFor(row: Record<string, unknown> | null, read?: 'http500' | 'ok') {
  return fakeSupabase({ row, read: read ?? 'ok' }).route
}

