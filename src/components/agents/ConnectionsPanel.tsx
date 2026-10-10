import { useCallback, useEffect, useState } from 'react'
import { Link2, Unplug, Shield } from 'lucide-react'
import clsx from 'clsx'
import type { AgentTypeId } from '../../lib/agentTypes'
import {
  CONNECTION_CATALOG,
  beginGmailConnect,
  disconnectConnection,
  listConnections,
  upsertConnection,
  type AgentConnection,
  type ConnectionType,
} from '../../lib/connections'
import {
  startGitHubOAuth,
  disconnectGitHub,
  fetchGitHubStatus,
  listGitHubRepos,
  type GitHubRepo,
} from '../../lib/connectors/githubApi'
import { useAuth } from '../../lib/auth/AuthContext'

type Props = { agentId: string; agentType: AgentTypeId }

const SELECTED_REPO_KEY = (agentId: string) => `nyven_code_selected_repo_${agentId}`

export function ConnectionsPanel({ agentId, agentType }: Props) {
  const { user } = useAuth()
  const [items, setItems] = useState<AgentConnection[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [serverGmail, setServerGmail] = useState<boolean | null>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubLogin, setGithubLogin] = useState<string | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setItems(listConnections(agentId))
  }, [agentId])

  const loadGitHub = useCallback(async () => {
    if (!user) {
      setGithubConnected(false)
      setRepos([])
      return
    }
    try {
      const s = await fetchGitHubStatus()
      const ok = !!s.connected
      setGithubConnected(ok)
      setGithubLogin(s.connection?.account_label || null)
      if (ok) {
        upsertConnection(agentId, 'github', {
          status: 'connected',
          accountLabel: s.connection?.account_label || undefined,
          scopes: s.connection?.scopes || ['read:user', 'repo'],
          connectedAt: s.connection?.connected_at || new Date().toISOString(),
          lastError: undefined,
        })
        setReposLoading(true)
        try {
          const list = await listGitHubRepos(1)
          setRepos(list)
        } catch (e) {
          setMessage(e instanceof Error ? e.message : 'Could not list repositories.')
          setRepos([])
        } finally {
          setReposLoading(false)
        }
      } else {
        disconnectConnection(agentId, 'github')
        setRepos([])
      }
      refresh()
    } catch {
      setGithubConnected(false)
    }
  }, [user, agentId, refresh])

  useEffect(() => {
    refresh()
    try {
      setSelectedRepo(localStorage.getItem(SELECTED_REPO_KEY(agentId)))
    } catch {
      /* ignore */
    }
    if (agentType === 'inbox') {
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
    }
    if (agentType === 'code') {
      void loadGitHub()
    }
  }, [agentId, agentType, refresh, loadGitHub])

  const relevant = CONNECTION_CATALOG.filter(
    (c) =>
      c.requiredForAgentTypes.includes(agentType as 'support' | 'inbox' | 'code') ||
      c.type === 'api' ||
      c.type === 'mcp' ||
      c.type === 'vexdyn'
  )

  const connectGmail = async () => {
    setBusy(true)
    setMessage(null)
    try {
      beginGmailConnect(agentId)
      const res = await fetch('/api/agent/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, action: 'status' }),
      })
      const data = await res.json()
      if (data?.connected) {
        upsertConnection(agentId, 'gmail', {
          status: 'connected',
          accountLabel: data.accountLabel || 'Server-configured Gmail',
          scopes: ['gmail.readonly', 'gmail.compose'],
          connectedAt: new Date().toISOString(),
          lastError: undefined,
        })
        setMessage('Gmail is available on the server for this deployment.')
        setServerGmail(true)
      } else {
        upsertConnection(agentId, 'gmail', {
          status: 'disconnected',
          lastError:
            'Per-user Gmail OAuth is not enabled yet. Configure server tokens or wait for OAuth.',
        })
        setMessage(
          'Gmail OAuth for individual accounts is not ready. Connection stays disconnected — nothing was faked.'
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
    setMessage('Gmail disconnected for this agent.')
    refresh()
  }

  const connectGithub = async () => {
    if (!user) {
      setMessage('Sign in to NYVEN to connect GitHub.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { authorizeUrl } = await startGitHubOAuth(
        `/agents/${agentId}?tab=connections`
      )
      window.location.href = authorizeUrl
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not start GitHub OAuth.')
      setBusy(false)
    }
  }

  const doDisconnectGithub = async () => {
    setBusy(true)
    try {
      await disconnectGitHub()
      disconnectConnection(agentId, 'github')
      setGithubConnected(false)
      setGithubLogin(null)
      setRepos([])
      setSelectedRepo(null)
      try {
        localStorage.removeItem(SELECTED_REPO_KEY(agentId))
      } catch {
        /* ignore */
      }
      setMessage('GitHub disconnected. NYVEN Code cannot access repositories until you reconnect.')
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  const selectRepo = (fullName: string) => {
    setSelectedRepo(fullName)
    try {
      localStorage.setItem(SELECTED_REPO_KEY(agentId), fullName)
    } catch {
      /* ignore */
    }
    const repo = repos.find((r) => r.full_name === fullName)
    setMessage(
      repo
        ? `Selected ${repo.full_name} (default branch: ${repo.default_branch}).`
        : `Selected ${fullName}.`
    )
  }

  const statusOf = (type: ConnectionType) => {
    const c = items.find((i) => i.type === type)
    if (type === 'gmail' && serverGmail) return 'connected'
    if (type === 'github' && githubConnected) return 'connected'
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
          const conn = items.find((i) => i.type === def.type)
          const primary = def.requiredForAgentTypes.includes(
            agentType as 'support' | 'inbox' | 'code'
          )
          return (
            <li
              key={def.type}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <Link2 size={16} className="text-nyven-cyan" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-nyven-text">{def.label}</h3>
                    <span
                      className={clsx(
                        'text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg',
                        st === 'connected' && 'bg-emerald-400/10 text-emerald-400',
                        st === 'pending' && 'bg-amber-400/10 text-amber-300',
                        st === 'error' && 'bg-red-400/10 text-red-300',
                        st === 'disconnected' &&
                          'bg-white/[0.06] text-nyven-text-secondary'
                      )}
                    >
                      {st}
                    </span>
                  </div>
                  <p className="text-xs text-nyven-text-secondary mt-1">{def.description}</p>
                  {(conn?.accountLabel || githubLogin) && def.type === 'github' && (
                    <p className="text-[11px] text-nyven-text-secondary mt-1">
                      {githubLogin || conn?.accountLabel}
                    </p>
                  )}
                  {conn?.accountLabel && def.type !== 'github' && (
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
                    {st === 'connected' ? 'Re-check connection' : 'Check Gmail status'}
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

              {def.type === 'github' && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {!githubConnected ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void connectGithub()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-nyven-cyan text-nyven-bg disabled:opacity-50"
                      >
                        {busy ? 'Starting…' : 'Connect GitHub'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doDisconnectGithub()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-white/[0.08] text-nyven-text-secondary"
                      >
                        <Unplug size={12} /> Disconnect
                      </button>
                    )}
                  </div>

                  {githubConnected && (
                    <div className="space-y-2">
                      <p className="text-xs text-nyven-text-secondary">
                        Select a repository for NYVEN Code context
                        {reposLoading ? ' (loading…)' : ''}:
                      </p>
                      {repos.length === 0 && !reposLoading && (
                        <p className="text-xs text-nyven-text-secondary/80">
                          No repositories returned. Check GitHub permissions or try reconnecting.
                        </p>
                      )}
                      <ul className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-white/[0.06] p-2">
                        {repos.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => selectRepo(r.full_name)}
                              className={clsx(
                                'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                                selectedRepo === r.full_name
                                  ? 'bg-nyven-cyan/15 text-nyven-text'
                                  : 'hover:bg-white/[0.04] text-nyven-text-secondary'
                              )}
                            >
                              <span className="font-medium text-nyven-text">{r.full_name}</span>
                              <span className="block text-[10px] opacity-70 mt-0.5">
                                {r.private ? 'Private' : 'Public'} · default: {r.default_branch}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {selectedRepo && (
                        <p className="text-[11px] text-nyven-cyan">
                          Active repo: {selectedRepo}
                        </p>
                      )}
                    </div>
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
