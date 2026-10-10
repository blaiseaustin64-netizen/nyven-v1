import { ExternalLink, GitBranch, GitFork, Lock, Star, CircleDot, Shield } from 'lucide-react'
import type { Branch, RepoDetail } from '../../lib/code/githubCodeApi'
import { Badge, ErrorNotice, LoadingRows, Panel } from './CodeUi'
import { FORGE_STATUS } from '../../lib/code/forgeBoundary'

type Props = {
  detail: RepoDetail | null
  detailLoading: boolean
  detailError: string | null
  branches: Branch[] | null
  branchesError: string | null
  ref_: string
  onRefChange: (ref: string) => void
}

export function RepoHeader(p: Props) {
  if (p.detailLoading && !p.detail) {
    return <Panel><LoadingRows label="Loading repository details…" rows={2} /></Panel>
  }
  if (p.detailError) return <ErrorNotice message={p.detailError} />
  if (!p.detail) return null
  const d = p.detail
  const canWrite = d.permissions.push || d.permissions.admin
  return (
    <Panel className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-lg sm:text-xl font-medium truncate">{d.full_name}</h2>
            <Badge tone={d.private ? 'warn' : 'neutral'}>{d.private ? <><Lock size={10} /> Private</> : 'Public'}</Badge>
            {d.archived && <Badge tone="warn">Archived</Badge>}
          </div>
          {d.description && <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">{d.description}</p>}
        </div>
        <a href={d.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-nyven-text-secondary hover:text-nyven-text shrink-0 min-h-[36px]">
          Open on GitHub <ExternalLink size={12} />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-nyven-text-secondary">
        {d.language && <span>{d.language}</span>}
        <span className="inline-flex items-center gap-1"><Star size={12} /> {d.stargazers_count}</span>
        <span className="inline-flex items-center gap-1"><GitFork size={12} /> {d.forks_count}</span>
        <span className="inline-flex items-center gap-1"><CircleDot size={12} /> {d.open_issues_count} open</span>
        {d.pushed_at && <span>Pushed {new Date(d.pushed_at).toLocaleDateString()}</span>}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-nyven-text-secondary">
          <GitBranch size={13} />
          <span>Branch</span>
          {p.branches && p.branches.length > 0 ? (
            <select
              aria-label="Branch"
              value={p.ref_}
              onChange={(e) => p.onRefChange(e.target.value)}
              className="bg-nyven-bg border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-nyven-text min-h-[36px] focus:outline-none focus:border-nyven-cyan/40 max-w-[220px]"
            >
              {p.branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}{b.name === d.default_branch ? ' (default)' : ''}{b.protected ? ' 🔒' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-nyven-text">{p.ref_ || d.default_branch}</span>
          )}
        </label>
        {p.branchesError && <span className="text-xs text-amber-300">Branch list unavailable: {p.branchesError}</span>}
        <span className="text-[11px] text-nyven-text-secondary sm:ml-auto flex items-center gap-1.5">
          <Shield size={11} /> Your access: {d.permissions.admin ? 'admin' : d.permissions.push ? 'write' : d.permissions.pull ? 'read' : 'none'}
          {canWrite ? ' · NYVEN Code is read-only in this phase' : ''}
        </span>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-nyven-text-secondary leading-relaxed">
        <span className="text-nyven-text">VEXDYN Forge:</span> not connected. {FORGE_STATUS.reason}
      </div>
    </Panel>
  )
}
