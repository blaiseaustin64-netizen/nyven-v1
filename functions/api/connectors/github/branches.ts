/**
 * GET /api/connectors/github/branches?owner=&repo=&page=&per_page=
 * Branches the signed-in user can see on a repository (read-only).
 */
import { authorizeGitHubRoute, jsonResponse, optionsResponse } from '../../../_shared/github/routeAuth'
import { githubGet, mapBranch, parseOwnerRepo, parsePageParams, repoApiPath } from '../../../_shared/github/api'
import type { GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse('GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)
  const parsed = parseOwnerRepo(url)
  if (!parsed.ok) return jsonResponse({ success: false, code: 'BAD_REQUEST', error: parsed.error }, 400)
  const { page, perPage } = parsePageParams(url)

  const auth = await authorizeGitHubRoute(request, env)
  if (!auth.ok) return auth.response

  const result = await githubGet(auth.token, `${repoApiPath(parsed.owner, parsed.repo)}/branches`, {
    page,
    per_page: perPage,
  })
  if (!result.ok) return jsonResponse({ success: false, code: result.code, error: result.error }, result.status)
  const raw = result.data as Array<Record<string, unknown>>
  return jsonResponse(
    {
      success: true,
      branches: raw.map(mapBranch),
      page,
      per_page: perPage,
      has_more: raw.length === perPage,
    },
    200
  )
}
