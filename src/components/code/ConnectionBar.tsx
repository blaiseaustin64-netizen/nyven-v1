import { Link } from 'react-router-dom'
import { CheckCircle2, Github, LogIn, Settings, Unplug } from 'lucide-react'
import type { ConnectionView } from '../../lib/code/codeState'
import { Badge, ErrorNotice, PrimaryButton, SecondaryButton, Panel } from './CodeUi'

type Props = {
  view: ConnectionView
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
  onRetry: () => void
}

export function ConnectionBar({ view, busy, onConnect, onDisconnect, onRetry }: Props) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
            <Github size={18} className="text-nyven-text" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-medium">GitHub connection</h2>
              <StatusBadge view={view} />
            </div>
            <p className="text-xs text-nyven-text-secondary mt-1 leading-relaxed">
              {view.kind === 'connected'
                ? `Signed in as ${view.account}. Repositories shown are only those your GitHub account can access.`
                : 'NYVEN uses a read-only GitHub grant. Tokens stay on the NYVEN server.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {view.kind === 'signed_out' && (
            <Link to="/auth" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nyven-cyan text-nyven-bg min-h-[40px]">
              <LogIn size={15} /> Sign in to NYVEN
            </Link>
          )}
          {view.kind === 'disconnected' && (
            <PrimaryButton onClick={onConnect} disabled={busy}>
              <Github size={15} /> {busy ? 'Opening GitHub…' : 'Connect GitHub'}
            </PrimaryButton>
          )}
          {view.kind === 'connected' && (
            <>
              <SecondaryButton onClick={onDisconnect} disabled={busy}>
                <Unplug size={13} /> {busy ? 'Disconnecting…' : 'Disconnect'}
              </SecondaryButton>
              <Link to="/settings?section=connections" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border border-white/[0.1] text-nyven-text-secondary min-h-[36px]">
                <Settings size={13} /> Manage
              </Link>
            </>
          )}
          {view.kind === 'unavailable' && <SecondaryButton onClick={onRetry}>Retry</SecondaryButton>}
        </div>
      </div>
      {view.kind === 'connected' && view.scopes.length > 0 && (
        <p className="text-[11px] text-nyven-text-secondary mt-3 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-emerald-300" /> Granted scopes: {view.scopes.join(', ')}
        </p>
      )}
      {view.kind === 'unconfigured' && <div className="mt-4"><ErrorNotice message={view.message} /></div>}
      {view.kind === 'unavailable' && <div className="mt-4"><ErrorNotice message={view.message} /></div>}
      {view.kind === 'auth_unavailable' && (
        <div className="mt-4"><ErrorNotice message="Account sign-in is not configured for this deployment, so GitHub cannot be managed here." /></div>
      )}
    </Panel>
  )
}

function StatusBadge({ view }: { view: ConnectionView }) {
  switch (view.kind) {
    case 'connected':
      return <Badge tone="good">Connected</Badge>
    case 'disconnected':
      return <Badge>Not connected</Badge>
    case 'signed_out':
      return <Badge tone="warn">Sign in required</Badge>
    case 'unconfigured':
      return <Badge tone="warn">Not configured</Badge>
    case 'unavailable':
      return <Badge tone="bad">Status unavailable</Badge>
    case 'auth_unavailable':
      return <Badge tone="bad">Sign-in unavailable</Badge>
    default:
      return <Badge>Checking…</Badge>
  }
}
