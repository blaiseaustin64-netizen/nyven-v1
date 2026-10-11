import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Code2, X } from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import {
  disconnectGitHub,
  fetchGitHubStatus,
  startGitHubOAuth,
} from '../lib/connectors/githubApi'
import {
  GENERIC_STATUS_ERROR,
  callbackReasonMessage,
  deriveConnectionView,
  filterRepos,
  messageForCode,
  requiresReconnect,
  type ConnectionStatusResponse,
} from '../lib/code/codeState'
import {
  REPO_PAGE_SIZE,
  fetchBranches,
  fetchContents,
  fetchIssues,
  fetchPulls,
  fetchRepo,
  fetchRepos,
  type Branch,
  type ContentsResponse,
  type IssueItem,
  type PullItem,
  type RepoDetail,
  type RepoSummary,
} from '../lib/code/githubCodeApi'
import { ConnectionBar } from '../components/code/ConnectionBar'
import { RepoBrowser } from '../components/code/RepoBrowser'
import { RepoHeader } from '../components/code/RepoHeader'
import { FileExplorer } from '../components/code/FileExplorer'
import { IssuePrList, type ListState } from '../components/code/IssuePrList'
import { EmptyNotice, ErrorNotice, Panel } from '../components/code/CodeUi'

/** Return destination for the OAuth flow. Validated server-side as an in-app relative path. */
const RETURN_TO = '/code'

type Tab = 'files' | 'issues' | 'pulls'

type Loadable<T> = { data: T | null; loading: boolean; error: string | null; page: number; hasMore: boolean }

export function Code() {
  const { user, configured: supabaseConfigured, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const githubParam = searchParams.get('github')
  const reasonParam = searchParams.get('reason')

  /* ─── Connection ─────────────────────────────────────────── */
  const [status, setStatus] = useState<ConnectionStatusResponse | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [connBusy, setConnBusy] = useState(false)
  const [connMsg, setConnMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setStatus((await fetchGitHubStatus()) as ConnectionStatusResponse)
      setStatusError(null)
    } catch {
      setStatusError(GENERIC_STATUS_ERROR)
    }
  }, [])

  const signedIn = !!user
  useEffect(() => {
    // Pre-account: load GitHub status even without NYVEN login
    if (!authLoading) void loadStatus()
  }, [authLoading, loadStatus])

  const view = useMemo(
    () =>
      deriveConnectionView({
        authLoading,
        supabaseConfigured,
        signedIn,
        status,
        statusError,
        allowPreAccountConnectors: true,
      }),
    [authLoading, supabaseConfigured, signedIn, status, statusError]
  )
  const connected = view.kind === 'connected'

  /* ─── Repositories ───────────────────────────────────────── */
  const [repos, setRepos] = useState<RepoSummary[] | null>(null)
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState<{ message: string; code?: string } | null>(null)
  const [reposPage, setReposPage] = useState(1)
  const [reposHasMore, setReposHasMore] = useState(false)
  const [repoQuery, setRepoQuery] = useState('')

  const loadRepos = useCallback(async (page: number, append: boolean) => {
    setReposLoading(true)
    setReposError(null)
    const r = await fetchRepos(page)
    setReposLoading(false)
    if (!r.ok) {
      setReposError({ message: messageForCode(r.code, r.error), code: r.code })
      if (!append) setRepos(null)
      return
    }
    setRepos((prev) => {
      if (!append || !prev) return r.data
      const seen = new Set(prev.map((x) => x.id))
      return [...prev, ...r.data.filter((x) => !seen.has(x.id))]
    })
    setReposPage(page)
    setReposHasMore(r.data.length >= REPO_PAGE_SIZE)
  }, [])

  useEffect(() => {
    if (connected) void loadRepos(1, false)
    else {
      setRepos(null)
      setReposError(null)
      setReposHasMore(false)
    }
  }, [connected, loadRepos])

  const filteredRepos = useMemo(() => filterRepos(repos ?? [], repoQuery), [repos, repoQuery])

  /* ─── Selection & repository details ─────────────────────── */
  const [selected, setSelected] = useState<RepoSummary | null>(null)
  const [detail, setDetail] = useState<RepoDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [branchesError, setBranchesError] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  const [tab, setTab] = useState<Tab>('files')
  const [path, setPath] = useState('')
  const [retryNonce, setRetryNonce] = useState(0)
  const retry = () => setRetryNonce((n) => n + 1)

  const ownerRepo = selected ? { owner: selected.owner, repo: selected.name } : null

  useEffect(() => {
    if (!ownerRepo) return
    let cancelled = false
    setDetail(null)
    setDetailLoading(true)
    setDetailError(null)
    setBranches(null)
    setBranchesError(null)
    setRef('')
    setPath('')
    setTab('files')
    void (async () => {
      const [d, b] = await Promise.all([fetchRepo(ownerRepo.owner, ownerRepo.repo), fetchBranches(ownerRepo.owner, ownerRepo.repo)])
      if (cancelled) return
      setDetailLoading(false)
      if (d.ok) setDetail(d.data)
      else setDetailError(messageForCode(d.code, d.error))
      if (b.ok) setBranches(b.data.branches)
      else setBranchesError(messageForCode(b.code, b.error))
    })()
    return () => {
      cancelled = true
    }
    // ownerRepo identity is derived from selected; depend on the selected full name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.full_name])

  const selectRepo = (r: RepoSummary) => setSelected(r)

  /* ─── Files ──────────────────────────────────────────────── */
  const [contents, setContents] = useState<ContentsResponse | null>(null)
  const [contentsLoading, setContentsLoading] = useState(false)
  const [contentsError, setContentsError] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerRepo || tab !== 'files') return
    let cancelled = false
    setContentsLoading(true)
    setContentsError(null)
    void fetchContents(ownerRepo.owner, ownerRepo.repo, ref || undefined, path).then((r) => {
      if (cancelled) return
      setContentsLoading(false)
      if (r.ok) setContents(r.data)
      else {
        setContents(null)
        setContentsError(messageForCode(r.code, r.error))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.full_name, ref, path, tab, retryNonce])

  /* ─── Issues & pull requests ─────────────────────────────── */
  const [listState, setListState] = useState<ListState>('open')
  const [issues, setIssues] = useState<Loadable<IssueItem[]>>({ data: null, loading: false, error: null, page: 0, hasMore: false })
  const [pulls, setPulls] = useState<Loadable<PullItem[]>>({ data: null, loading: false, error: null, page: 0, hasMore: false })

  useEffect(() => {
    if (!ownerRepo || tab !== 'issues') return
    let cancelled = false
    setIssues((s) => ({ ...s, loading: true, error: null }))
    void fetchIssues(ownerRepo.owner, ownerRepo.repo, listState, 1).then((r) => {
      if (cancelled) return
      setIssues(
        r.ok
          ? { data: r.data.items, loading: false, error: null, page: 1, hasMore: r.data.has_more }
          : { data: null, loading: false, error: messageForCode(r.code, r.error), page: 0, hasMore: false }
      )
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.full_name, tab, listState, retryNonce])

  useEffect(() => {
    if (!ownerRepo || tab !== 'pulls') return
    let cancelled = false
    setPulls((s) => ({ ...s, loading: true, error: null }))
    void fetchPulls(ownerRepo.owner, ownerRepo.repo, listState, 1).then((r) => {
      if (cancelled) return
      setPulls(
        r.ok
          ? { data: r.data.items, loading: false, error: null, page: 1, hasMore: r.data.has_more }
          : { data: null, loading: false, error: messageForCode(r.code, r.error), page: 0, hasMore: false }
      )
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.full_name, tab, listState, retryNonce])

  const loadMoreIssues = async () => {
    if (!ownerRepo) return
    const next = issues.page + 1
    setIssues((s) => ({ ...s, loading: true }))
    const r = await fetchIssues(ownerRepo.owner, ownerRepo.repo, listState, next)
    setIssues((s) =>
      r.ok
        ? { data: [...(s.data ?? []), ...r.data.items], loading: false, error: null, page: next, hasMore: r.data.has_more }
        : { ...s, loading: false, error: messageForCode(r.code, r.error) }
    )
  }

  const loadMorePulls = async () => {
    if (!ownerRepo) return
    const next = pulls.page + 1
    setPulls((s) => ({ ...s, loading: true }))
    const r = await fetchPulls(ownerRepo.owner, ownerRepo.repo, listState, next)
    setPulls((s) =>
      r.ok
        ? { data: [...(s.data ?? []), ...r.data.items], loading: false, error: null, page: next, hasMore: r.data.has_more }
        : { ...s, loading: false, error: messageForCode(r.code, r.error) }
    )
  }

  /* ─── Actions ────────────────────────────────────────────── */
  const connect = async () => {
    setConnBusy(true)
    setConnMsg(null)
    try {
      const { authorizeUrl } = await startGitHubOAuth(RETURN_TO)
      window.location.href = authorizeUrl
    } catch (e) {
      setConnMsg(e instanceof Error ? e.message : 'Could not start GitHub authorization.')
      setConnBusy(false)
    }
  }

  const disconnect = async () => {
    setConnBusy(true)
    setConnMsg(null)
    try {
      await disconnectGitHub()
      setSelected(null)
      setRepos(null)
      setConnMsg('GitHub disconnected. Repositories are no longer accessible from NYVEN Code.')
      await loadStatus()
    } catch (e) {
      setConnMsg(e instanceof Error ? e.message : 'Could not disconnect GitHub.')
    } finally {
      setConnBusy(false)
    }
  }

  const dismissCallbackBanner = () => {
    setSearchParams({}, { replace: true })
  }

  const reposNeedReconnect = requiresReconnect(reposError?.code)
  const showConnectedWorkspace = connected

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-nyven-cyan/10 border border-nyven-cyan/20 text-nyven-cyan shrink-0">
              <Code2 size={20} />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-medium">NYVEN Code</h1>
              <p className="text-nyven-text-secondary text-sm mt-1 leading-relaxed">
                Browse your GitHub repositories, files, issues, and pull requests. Read-only in this phase.
              </p>
            </div>
          </div>
        </header>

        {githubParam === 'connected' && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">
            <span>GitHub connected. Your repositories are loading.</span>
            <button type="button" onClick={dismissCallbackBanner} aria-label="Dismiss" className="text-emerald-200/70 hover:text-emerald-100"><X size={14} /></button>
          </div>
        )}
        {githubParam === 'error' && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1"><ErrorNotice message={callbackReasonMessage(reasonParam)} /></div>
            <button type="button" onClick={dismissCallbackBanner} aria-label="Dismiss" className="mt-3 text-nyven-text-secondary hover:text-nyven-text"><X size={14} /></button>
          </div>
        )}
        {connMsg && <p role="status" className="text-xs text-nyven-text-secondary">{connMsg}</p>}

        <ConnectionBar
          view={view}
          busy={connBusy}
          onConnect={connect}
          onDisconnect={disconnect}
          onRetry={() => void loadStatus()}
        />

        {!showConnectedWorkspace && view.kind !== 'loading' && (
          <Panel className="p-8">
            <EmptyNotice
              title={
                view.kind === 'signed_out'
                  ? 'Sign in to open your repositories'
                  : view.kind === 'unconfigured'
                    ? 'GitHub is not configured yet'
                    : 'Connect GitHub to browse repositories'
              }
              body={
                view.kind === 'signed_out'
                  ? 'NYVEN Code uses your NYVEN account to find your GitHub connection.'
                  : view.kind === 'unconfigured'
                    ? 'Repositories appear here once the server is configured for GitHub.'
                    : 'Only repositories your GitHub account can access will appear. NYVEN never shows repositories you have not granted.'
              }
            />
          </Panel>
        )}

        {showConnectedWorkspace && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5 lg:h-[calc(100vh-18rem)] lg:min-h-[480px]">
            <div className="min-h-0 lg:h-full">
              <RepoBrowser
                repos={repos}
                loading={reposLoading}
                error={reposError?.message ?? null}
                errorNeedsReconnect={reposNeedReconnect}
                hasMore={reposHasMore}
                query={repoQuery}
                onQueryChange={setRepoQuery}
                filtered={filteredRepos}
                selectedFullName={selected?.full_name ?? null}
                onSelect={selectRepo}
                onLoadMore={() => void loadRepos(reposPage + 1, true)}
                onReload={() => void loadRepos(1, false)}
                onReconnect={() => void connect()}
              />
            </div>

            <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:h-full lg:pr-1">
              {!selected && (
                <Panel className="p-10">
                  <EmptyNotice
                    title="Select a repository"
                    body="Choose a repository to browse its files, branches, issues, and pull requests."
                  />
                </Panel>
              )}

              {selected && (
                <>
                  <RepoHeader
                    detail={detail}
                    detailLoading={detailLoading}
                    detailError={detailError}
                    branches={branches}
                    branchesError={branchesError}
                    ref_={ref || detail?.default_branch || ''}
                    onRefChange={(r) => {
                      setRef(r)
                      setPath('')
                    }}
                  />

                  <div role="tablist" aria-label="Repository sections" className="flex gap-1 border-b border-white/[0.06]">
                    {(
                      [
                        ['files', 'Files'],
                        ['issues', 'Issues'],
                        ['pulls', 'Pull requests'],
                      ] as Array<[Tab, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`px-4 py-2.5 text-sm -mb-px border-b-2 min-h-[40px] ${
                          tab === id ? 'border-nyven-cyan text-nyven-text' : 'border-transparent text-nyven-text-secondary hover:text-nyven-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {tab === 'files' && (
                    <FileExplorer
                      path={path}
                      loading={contentsLoading}
                      error={contentsError}
                      data={contents}
                      onOpenDir={setPath}
                      onNavigateCrumb={setPath}
                      onRetry={retry}
                    />
                  )}

                  {tab === 'issues' && (
                    <IssuePrList
                      kind="issues"
                      items={issues.data}
                      loading={issues.loading}
                      error={issues.error}
                      hasMore={issues.hasMore}
                      state={listState}
                      onStateChange={setListState}
                      onLoadMore={() => void loadMoreIssues()}
                      onRetry={retry}
                    />
                  )}

                  {tab === 'pulls' && (
                    <IssuePrList
                      kind="pulls"
                      items={pulls.data}
                      loading={pulls.loading}
                      error={pulls.error}
                      hasMore={pulls.hasMore}
                      state={listState}
                      onStateChange={setListState}
                      onLoadMore={() => void loadMorePulls()}
                      onRetry={retry}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

