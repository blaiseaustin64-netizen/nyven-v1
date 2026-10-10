import { Lock, Globe, Search, RefreshCw } from 'lucide-react'
import type { RepoSummary } from '../../lib/code/githubCodeApi'
import { LoadingRows, Panel, ErrorNotice, EmptyNotice, SecondaryButton } from './CodeUi'

type Props = {
  repos: RepoSummary[] | null
  loading: boolean
  error: string | null
  errorNeedsReconnect: boolean
  hasMore: boolean
  query: string
  onQueryChange: (q: string) => void
  filtered: RepoSummary[]
  selectedFullName: string | null
  onSelect: (repo: RepoSummary) => void
  onLoadMore: () => void
  onReload: () => void
  onReconnect: () => void
}

export function RepoBrowser(p: Props) {
  return (
    <Panel className="flex flex-col min-h-[320px] lg:min-h-0 overflow-hidden">
      <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nyven-text-secondary" />
          <input
            type="search"
            aria-label="Search repositories"
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            placeholder="Search loaded repositories"
            className="w-full bg-nyven-bg border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-nyven-text-secondary/60 focus:outline-none focus:border-nyven-cyan/40 min-h-[38px]"
          />
        </div>
        <button
          type="button"
          onClick={p.onReload}
          aria-label="Reload repositories"
          className="p-2 rounded-lg border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text min-h-[38px] min-w-[38px] flex items-center justify-center"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {p.loading && (p.repos === null || p.repos.length === 0) && <LoadingRows label="Loading repositories from GitHub…" />}

        {p.error && (
          <div className="p-3">
            <ErrorNotice
              message={p.error}
              action={
                p.errorNeedsReconnect ? (
                  <SecondaryButton onClick={p.onReconnect}>Reconnect GitHub</SecondaryButton>
                ) : (
                  <SecondaryButton onClick={p.onReload}>Try again</SecondaryButton>
                )
              }
            />
          </div>
        )}

        {!p.loading && !p.error && p.repos !== null && p.repos.length === 0 && (
          <EmptyNotice
            title="No repositories are visible"
            body="GitHub returned no repositories for this account. Check the repositories your GitHub grant covers."
          />
        )}

        {p.repos !== null && p.repos.length > 0 && p.filtered.length === 0 && (
          <EmptyNotice title={`No loaded repositories match “${p.query.trim()}”`} body={p.hasMore ? 'Load more repositories, then search again.' : undefined} />
        )}

        <ul className="divide-y divide-white/[0.04]" aria-label="Repositories">
          {p.filtered.map((r) => {
            const active = r.full_name === p.selectedFullName
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => p.onSelect(r)}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full text-left px-4 py-3 transition-colors min-h-[56px] ${
                    active ? 'bg-nyven-cyan/[0.07] border-l-2 border-nyven-cyan' : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.private ? <Lock size={12} className="shrink-0 text-amber-300" /> : <Globe size={12} className="shrink-0 text-nyven-text-secondary" />}
                    <span className="text-sm truncate">{r.full_name}</span>
                  </div>
                  {r.description && <p className="text-xs text-nyven-text-secondary mt-0.5 truncate">{r.description}</p>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {p.hasMore && p.repos !== null && (
        <div className="p-3 border-t border-white/[0.06]">
          <SecondaryButton onClick={p.onLoadMore} disabled={p.loading}>
            {p.loading ? 'Loading…' : 'Load more repositories'}
          </SecondaryButton>
        </div>
      )}
    </Panel>
  )
}
