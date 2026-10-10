/**
 * GET /api/connectors/github/contents?owner=&repo=&ref=&path=
 * Directory listing or file view at a ref (read-only). Binary and very large files return metadata only.
 */
import { authorizeGitHubRoute, jsonResponse, optionsResponse } from '../../../_shared/github/routeAuth'
import {
  decodeFileContent,
  githubGet,
  isValidRef,
  mapContentEntry,
  normalizeRepoPath,
  parseOwnerRepo,
  repoApiPath,
  type ContentEntry,
} from '../../../_shared/github/api'
import type { GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse('GET, OPTIONS')

const TYPE_ORDER: Record<ContentEntry['type'], number> = { dir: 0, file: 1, symlink: 2, submodule: 3, other: 4 }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)
  const parsed = parseOwnerRepo(url)
  if (!parsed.ok) return jsonResponse({ success: false, code: 'BAD_REQUEST', error: parsed.error }, 400)

  const ref = url.searchParams.get('ref') || ''
  if (ref && !isValidRef(ref)) {
    return jsonResponse({ success: false, code: 'BAD_REQUEST', error: 'Branch or ref name is not valid.' }, 400)
  }
  const pathResult = normalizeRepoPath(url.searchParams.get('path') || '')
  if (!pathResult.ok) return jsonResponse({ success: false, code: 'BAD_REQUEST', error: pathResult.error }, 400)
  const path = pathResult.path
  const encodedPath = path
    ? '/' + path.split('/').map((s) => encodeURIComponent(s)).join('/')
    : ''

  const auth = await authorizeGitHubRoute(request, env)
  if (!auth.ok) return auth.response

  const query = ref ? { ref } : undefined
  const result = await githubGet(auth.token, `${repoApiPath(parsed.owner, parsed.repo)}/contents${encodedPath}`, query)
  if (!result.ok) return jsonResponse({ success: false, code: result.code, error: result.error }, result.status)

  if (Array.isArray(result.data)) {
    const entries = (result.data as Array<Record<string, unknown>>)
      .map(mapContentEntry)
      .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name))
    return jsonResponse({ success: true, kind: 'dir', path, ref: ref || null, entries }, 200)
  }

  const item = result.data as Record<string, unknown>
  const meta = mapContentEntry(item)
  if (meta.type !== 'file') {
    return jsonResponse({ success: true, kind: 'other', path, ref: ref || null, entry: meta }, 200)
  }

  const base64 = typeof item.content === 'string' ? item.content : ''
  const view =
    base64 === '' && meta.size > 0
      ? { encoding: 'too_large' as const }
      : (() => {
          try {
            return decodeFileContent(base64, meta.size)
          } catch {
            return { encoding: 'binary' as const }
          }
        })()

  return jsonResponse(
    {
      success: true,
      kind: 'file',
      path,
      ref: ref || null,
      entry: meta,
      file: view,
    },
    200
  )
}
