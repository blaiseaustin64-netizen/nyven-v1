/**
 * GET /api/connectors/github/repo?owner=&repo=
 * Repository metadata for the signed-in user's own GitHub grant (read-only).
 */
import { authorizeGitHubRoute, jsonResponse, optionsResponse } from '../../../_shared/github/routeAuth'
import { githubGet, mapRepoDetail, parseOwnerRepo, repoApiPath } from '../../../_shared/github/api'
import type { GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse('GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const parsed = parseOwnerRepo(new URL(request.url))
  if (!parsed.ok) return jsonResponse({ success: false, code: 'BAD_REQUEST', error: parsed.error }, 400)

  const auth = await authorizeGitHubRoute(request, env)
  if (!auth.ok) return auth.response

  const result = await githubGet(auth.token, repoApiPath(parsed.owner, parsed.repo))
  if (!result.ok) return jsonResponse({ success: false, code: result.code, error: result.error }, result.status)
  return jsonResponse({ success: true, repo: mapRepoDetail(result.data as Record<string, unknown>) }, 200)
}
