import { useCallback, useEffect, useState } from 'react'
import { Link2, Unplug, Shield } from 'lucide-react'
import clsx from 'clsx'
import type { AgentTypeId } from '../../lib/agentTypes'
import {
  CONNECTION_CATALOG,
  beginGmailConnect,
  disconnectConnection,
  getConnection,
  listConnections,
  upsertConnection,
  type AgentConnection,
  type ConnectionType,
} from '../../lib/connections'

type Props = { agentId: string; agentType: AgentTypeId }

export function ConnectionsPanel({ agentId, agentType }: Props) {
  const [items, setItems] = useState<AgentConnection[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [serverGmail, setServerGmail] = useState<boolean | null>(null)

  const refresh = useCallback(() => {
    setItems(listConnections(agentId))
  }, [agentId])

  useEffect(() => {
    refresh()
    fetch('/api/agent/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, action: 'status' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setServerGmail(!!d.connected)
      })
      .catch(() => setServerGmail(false))
  }, [agentId, refresh])

  const relevant = CONNECTION_CATALOG.filter(
    (c) =>
      c.requiredForAgentTypes.includes(agentType) ||
      c.type === 'api' ||
      c.type === 'mcp' ||
      c.type === 'vexdyn'
  )

  const connectGmail = async () => {
    setBusy(true)
    setMessage(null)
    try {
      // Start local pending state; real OAuth tokens stay server-side only
      beginGmailConnect(agentId)

      // Probe server — if env tokens exist, mark connected (deployment-level)
      const res = await fetch('/api/agent/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, action: 'status' }),
      })
      const data = await res.json()
      if (data?.connected) {
        upsertConnection(agentId, 'gmail', {
          status: 'connected',
          accountLabel: 'Connected (server OAuth)',
          scopes: ['gmail.readonly', 'gmail.compose'],
          connectedAt: new Date().toISOString(),
          lastError: undefined,
        })
        setMessage('Gmail is connected on the server.')
        setServerGmail(true)
      } else {
        upsertConnection(agentId, 'gmail', {
          status: 'pending',
          lastError:
            'Authorize Gmail via OAuth and configure server tokens (GMAIL_ACCESS_TOKEN or refresh flow). No fake mailbox is used.',
        })
        setMessage(
          'Gmail authorization required. Complete Google OAuth for this deployment so the server holds tokens — credentials never enter the browser.'
        )
        setServerGmail(false)
      }
      refresh()
    } catch {
      setMessage('Could not reach the inbox service.')
    } finally {
      setBusy(false)
    }
  }

  const disconnectGmail = () => {
    disconnectConnection(agentId, 'gmail')
    setMessage('Gmail disconnected for this agent. Server tokens must be rotated/revoked in your OAuth console.')
    refresh()
  }

  const statusOf = (type: ConnectionType) => {
    const c = items.find((i) => i.type === type)
    if (type === 'gmail' && serverGmail) return 'connected'
    return c?.status || 'disconnected'
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-medium">Connections</h2>
        <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
          Agents only use connections you enable. Secrets and OAuth tokens stay on the server —
          never in the browser or widget.
        </p>
      </div>

      {message && (
        <div className="text-sm text-nyven-text-secondary bg-nyven-surface border border-white/[0.06] rounded-xl px-4 py-3">
          {message}
        </div>
      )}

      <ul className="space-y-3">
        {relevant.map((def) => {
          const st = statusOf(def.type)
          const conn = getConnection(agentId, def.type)
          const primary = def.requiredForAgentTypes.includes(agentType)
          return (
            <li
              key={def.type}
              className={clsx(
                'p-4 rounded-2xl border bg-nyven-surface',
                primary ? 'border-white/[0.08]' : 'border-white/[0.04] opacity-80'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link2 size={16} className="text-nyven-cyan" />
                    <span className="font-medium text-sm">{def.label}</span>
                    <span
                      className={clsx(
                        'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                        st === 'connected' && 'bg-emerald-400/10 text-emerald-400',
                        st === 'pending' && 'bg-amber-400/10 text-amber-400',
                        (st === 'disconnected' || st === 'revoked') &&
                          'bg-white/[0.06] text-nyven-text-secondary',
                        st === 'error' && 'bg-red-400/10 text-red-300'
                      )}
                    >
                      {st}
                    </span>
                  </div>
                  <p className="text-xs text-nyven-text-secondary mt-1">{def.description}</p>
                  {conn?.accountLabel && (
                    <p className="text-[11px] text-nyven-text-secondary mt-1">
                      {conn.accountLabel}
                    </p>
                  )}
                  <ul className="mt-2 text-[11px] text-nyven-text-secondary/80 space-y-0.5">
                    {def.permissionSummary.map((p) => (
                      <li key={p} className="flex gap-1.5">
                        <Shield size={10} className="mt-0.5 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {def.type === 'gmail' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={connectGmail}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-nyven-cyan text-nyven-bg disabled:opacity-50"
                  >
                    {st === 'connected' ? 'Re-check connection' : 'Connect Gmail'}
                  </button>
                  {(st === 'connected' || st === 'pending') && (
                    <button
                      type="button"
                      onClick={disconnectGmail}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-white/[0.08] text-nyven-text-secondary"
                    >
                      <Unplug size={12} /> Disconnect
                    </button>
                  )}
                </div>
              )}

              {def.type === 'website' && agentType === 'support' && (
                <p className="text-[11px] text-nyven-text-secondary mt-3">
                  Manage allowlisted domains under the Domains tab. Install the widget from
                  Deploy.
                </p>
              )}

              {!primary && (
                <p className="text-[11px] text-nyven-text-secondary/60 mt-2">
                  Foundation only — not active for this agent type yet.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
