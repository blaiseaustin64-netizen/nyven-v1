import { ExternalLink, File, Folder, ChevronRight } from 'lucide-react'
import type { ContentEntry, ContentsResponse } from '../../lib/code/githubCodeApi'
import { formatBytes, splitPath } from '../../lib/code/codeState'
import { EmptyNotice, ErrorNotice, LoadingRows, Panel } from './CodeUi'

type Props = {
  path: string
  loading: boolean
  error: string | null
  data: ContentsResponse | null
  onOpenDir: (path: string) => void
  onNavigateCrumb: (path: string) => void
  onRetry: () => void
}

export function FileExplorer(p: Props) {
  const crumbs = splitPath(p.path)
  return (
    <Panel className="overflow-hidden">
      <nav aria-label="Path" className="flex items-center gap-1 flex-wrap px-4 py-3 border-b border-white/[0.06] text-xs text-nyven-text-secondary">
        {crumbs.map((c, i) => (
          <span key={c.path} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="opacity-50" />}
            <button type="button" onClick={() => p.onNavigateCrumb(c.path)} className="hover:text-nyven-text px-1 py-0.5 rounded min-h-[28px]">
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {p.loading && <LoadingRows label="Loading from GitHub…" />}
      {p.error && !p.loading && (
        <div className="p-4"><ErrorNotice message={p.error} action={<button type="button" onClick={p.onRetry} className="text-xs underline">Try again</button>} /></div>
      )}

      {!p.loading && !p.error && p.data?.kind === 'dir' && (
        p.data.entries.length === 0 ? (
          <EmptyNotice title="This directory is empty" />
        ) : (
          <ul className="divide-y divide-white/[0.04]" aria-label="Directory contents">
            {p.path && (
              <li>
                <button type="button" onClick={() => p.onNavigateCrumb(parentPathOf(p.path))} className="w-full text-left px-4 py-2.5 text-sm text-nyven-text-secondary hover:bg-white/[0.03] min-h-[44px]">
                  ..
                </button>
              </li>
            )}
            {p.data.entries.map((e) => (
              <EntryRow key={e.path} entry={e} onOpenDir={p.onOpenDir} />
            ))}
          </ul>
        )
      )}

      {!p.loading && !p.error && p.data?.kind === 'file' && <FileView entry={p.data.entry} file={p.data.file} />}
      {!p.loading && !p.error && p.data?.kind === 'other' && (
        <EmptyNotice title={`${p.data.entry.name} is a ${p.data.entry.type}`} body="Open this entry on GitHub to inspect it." />
      )}
    </Panel>
  )
}

function parentPathOf(path: string): string {
  return path.split('/').filter(Boolean).slice(0, -1).join('/')
}

function EntryRow({ entry, onOpenDir }: { entry: ContentEntry; onOpenDir: (p: string) => void }) {
  const isDir = entry.type === 'dir'
  const body = (
    <>
      {isDir ? <Folder size={14} className="text-nyven-cyan shrink-0" /> : <File size={14} className="text-nyven-text-secondary shrink-0" />}
      <span className="truncate flex-1">{entry.name}</span>
      {!isDir && entry.type === 'file' && <span className="text-[11px] text-nyven-text-secondary shrink-0">{formatBytes(entry.size)}</span>}
    </>
  )
  return (
    <li>
      {isDir ? (
        <button type="button" onClick={() => onOpenDir(entry.path)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/[0.03] min-h-[44px]">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5 text-sm min-h-[44px]">
          {body}
          {entry.html_url && (
            <a href={entry.html_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${entry.name} on GitHub`} className="text-nyven-text-secondary hover:text-nyven-text">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </li>
  )
}

function FileView({ entry, file }: { entry: ContentEntry; file: Extract<ContentsResponse, { kind: 'file' }>['file'] }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06] text-xs text-nyven-text-secondary">
        <span className="truncate">{entry.name} · {formatBytes(entry.size)}</span>
        {entry.html_url && (
          <a href={entry.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-nyven-text shrink-0">
            View on GitHub <ExternalLink size={11} />
          </a>
        )}
      </div>
      {file.encoding === 'utf-8' && (
        <pre className="text-xs leading-relaxed font-mono overflow-auto max-h-[60vh] p-4 text-nyven-text" aria-label={`Contents of ${entry.name}`}>
          <code>
            {file.content.split('\n').map((line, i) => (
              <span key={i} className="flex">
                <span className="select-none w-10 shrink-0 text-right pr-4 text-nyven-text-secondary/50">{i + 1}</span>
                <span className="whitespace-pre">{line || ' '}</span>
              </span>
            ))}
          </code>
        </pre>
      )}
      {file.encoding === 'binary' && <EmptyNotice title="Binary file" body="Inline preview is not available. Open it on GitHub." />}
      {file.encoding === 'too_large' && <EmptyNotice title="File is too large to preview" body="Files over 512 KB are not shown inline. Open it on GitHub." />}
    </div>
  )
}
