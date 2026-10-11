/**
 * GET /api/connectors/github/repos
 * List repositories using the caller's stored GitHub grant.
 * Supports signed-in NYVEN users (DB) and pre-account GitHub cookie store.
 */
import { authorizeGitHubRoute, jsonResponse, optionsResponse } from '../../../_shared/github/routeAuth'
import { listUserRepos, type GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse('GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const auth = await authorizeGitHubRoute(request, env)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1') || 1
  const listed = await listUserRepos(auth.token, { page, perPage: 50 })
  if ('error' in listed) {
    return jsonResponse(
      { success: false, code: 'GITHUB_API', error: listed.error },
      listed.status === 401 || listed.status === 403 ? 400 : 502
    )
  }

  return jsonResponse({ success: true, repos: listed.repos }, 200)
}
