import { ExternalLink, GitPullRequest, CircleDot } from 'lucide-react'
import type { IssueItem, PullItem } from '../../lib/code/githubCodeApi'
import { Badge, EmptyNotice, ErrorNotice, LoadingRows, Panel, SecondaryButton } from './CodeUi'

export type ListState = 'open' | 'closed' | 'all'

type Props =
  | {
      kind: 'issues'
      items: IssueItem[] | null
      loading: boolean
      error: string | null
      hasMore: boolean
      state: ListState
      onStateChange: (s: ListState) => void
      onLoadMore: () => void
      onRetry: () => void
    }
  | {
      kind: 'pulls'
      items: PullItem[] | null
      loading: boolean
      error: string | null
      hasMore: boolean
      state: ListState
      onStateChange: (s: ListState) => void
      onLoadMore: () => void
      onRetry: () => void
    }

export function IssuePrList(p: Props) {
  const noun = p.kind === 'issues' ? 'issues' : 'pull requests'
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex gap-1" role="group" aria-label={`Filter ${noun} by state`}>
          {(['open', 'closed', 'all'] as ListState[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={p.state === s}
              onClick={() => p.onStateChange(s)}
              className={`px-3 py-1.5 rounded-lg text-xs capitalize min-h-[32px] ${
                p.state === s ? 'bg-nyven-cyan/10 text-nyven-cyan' : 'text-nyven-text-secondary hover:text-nyven-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {p.loading && (p.items === null || p.items.length === 0) && <LoadingRows label={`Loading ${noun} from GitHub…`} />}
      {p.error && (
        <div className="p-4"><ErrorNotice message={p.error} action={<SecondaryButton onClick={p.onRetry}>Try again</SecondaryButton>} /></div>
      )}
      {!p.error && !p.loading && p.items !== null && p.items.length === 0 && (
        <EmptyNotice title={`No ${p.state === 'all' ? '' : p.state + ' '}${noun}`} body="Nothing matches this filter in the repository." />
      )}

      {p.items !== null && p.items.length > 0 && (
        <ul className="divide-y divide-white/[0.04]" aria-label={noun}>
          {p.kind === 'issues'
            ? (p.items as IssueItem[]).map((i) => <Row key={i.number} number={i.number} title={i.title} state={i.state} author={i.author} updated={i.updated_at} url={i.html_url} icon="issue" labels={i.labels} comments={i.comments} />)
            : (p.items as PullItem[]).map((pr) => (
                <Row
                  key={pr.number}
                  number={pr.number}
                  title={pr.title}
                  state={pr.merged ? 'merged' : pr.state}
                  author={pr.author}
                  updated={pr.updated_at}
                  url={pr.html_url}
                  icon="pr"
                  detail={`${pr.head} → ${pr.base}`}
                  draft={pr.draft}
                />
              ))}
        </ul>
      )}

      {p.hasMore && p.items !== null && (
        <div className="p-3 border-t border-white/[0.06]">
          <SecondaryButton onClick={p.onLoadMore} disabled={p.loading}>{p.loading ? 'Loading…' : `Load more ${noun}`}</SecondaryButton>
        </div>
      )}
    </Panel>
  )
}

type RowProps = {
  number: number
  title: string
  state: string
  author: string
  updated: string
  url: string
  icon: 'issue' | 'pr'
  labels?: Array<{ name: string; color: string }>
  comments?: number
  detail?: string
  draft?: boolean
}

function Row(r: RowProps) {
  const tone = r.state === 'open' ? 'good' : r.state === 'merged' ? 'info' : 'neutral'
  const Icon = r.icon === 'pr' ? GitPullRequest : CircleDot
  return (
    <li className="px-4 py-3 flex gap-3">
      <Icon size={15} className={`mt-0.5 shrink-0 ${r.state === 'open' ? 'text-emerald-300' : 'text-nyven-text-secondary'}`} />
      <div className="min-w-0 flex-1">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-nyven-cyan inline-flex items-center gap-1.5 max-w-full">
          <span className="truncate">{r.title}</span>
          <ExternalLink size={11} className="shrink-0 opacity-60" />
        </a>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-nyven-text-secondary">
          <span>#{r.number}</span>
          <Badge tone={tone}>{r.state}</Badge>
          {r.draft && <Badge>draft</Badge>}
          {r.detail && <span className="font-mono">{r.detail}</span>}
          <span>by {r.author || 'unknown'}</span>
          <span>updated {new Date(r.updated).toLocaleDateString()}</span>
          {typeof r.comments === 'number' && r.comments > 0 && <span>{r.comments} comments</span>}
        </div>
        {r.labels && r.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {r.labels.map((l) => (
              <span key={l.name} className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] text-nyven-text-secondary">{l.name}</span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
