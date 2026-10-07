import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Globe } from 'lucide-react'
import clsx from 'clsx'
import type { AgentDomain, DomainStatus } from '../../lib/domainTypes'
import {
  addDomain,
  listDomains,
  normalizeDomain,
  removeDomain,
  updateDomain,
} from '../../lib/domainStore'
import { checkDomainCount, getEntitlements } from '../../lib/entitlements'
import { getAgentInstance, publishAgentConfig } from '../../lib/agentStore'
import { toPublishedKnowledge } from '../../lib/knowledgeStore'
import { listActiveAllowlist, listDomains, addDomain, removeDomain, updateDomain } from '../../lib/domainStore'

type Props = { agentId: string }

const STATUS_LABEL: Record<DomainStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  blocked: 'Blocked',
  disabled: 'Disabled',
}

export function DomainsPanel({ agentId }: Props) {
  const [domains, setDomains] = useState<AgentDomain[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const entitlements = getEntitlements()

  const refresh = useCallback(() => setDomains(listDomains(agentId)), [agentId])
  useEffect(() => {
    refresh()
  }, [refresh])

  const republish = async () => {
    const agent = getAgentInstance(agentId)
    if (!agent) return
    await publishAgentConfig(agent, toPublishedKnowledge(agentId), {
      allowedDomains: listActiveAllowlist(agentId),
    })
  }

  const handleAdd = async () => {
    setError(null)
    const check = checkDomainCount(domains.length)
    if (!check.allowed) {
      setError(check.reason)
      return
    }
    try {
      addDomain({ agentId, domain: input })
      setInput('')
      refresh()
      await republish()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add domain.')
    }
  }

  const setStatus = async (id: string, status: DomainStatus) => {
    try {
      updateDomain(id, { status })
      refresh()
      await republish()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
    }
  }

  const toggleEnabled = async (d: AgentDomain) => {
    try {
      updateDomain(d.id, { enabled: !d.enabled })
      refresh()
      await republish()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
    }
  }

  const handleRemove = async (id: string) => {
    try {
      removeDomain(id)
      refresh()
      await republish()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-medium">Domains</h2>
        <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
          Approved websites for this agent. When at least one domain is listed and enabled,
          the widget is blocked on other origins (server-side). Status stays{' '}
          <strong className="text-nyven-text">Pending</strong> until a real verification
          challenge exists — it is not claimed verified automatically.
        </p>
        <p className="text-xs text-nyven-text-secondary mt-2">
          Plan: {entitlements.label} · up to {entitlements.maxDomainsPerAgent} domains
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="example.com"
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/40"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
        >
          <Plus size={14} /> Add domain
        </button>
      </div>

      {domains.length === 0 ? (
        <div className="flex flex-col items-center py-12 rounded-2xl border border-dashed border-white/[0.08] text-center">
          <Globe className="text-nyven-text-secondary mb-3 opacity-50" size={28} />
          <p className="text-sm text-nyven-text-secondary max-w-sm">
            No domains yet. Without a list, the widget accepts any origin. Add domains to
            restrict production use.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {domains.map((d) => (
            <li
              key={d.id}
              className="p-4 rounded-xl border border-white/[0.06] bg-nyven-surface flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{d.domain}</div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <span
                    className={clsx(
                      'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                      d.status === 'verified' && 'bg-emerald-400/10 text-emerald-400',
                      d.status === 'pending' && 'bg-amber-400/10 text-amber-400',
                      d.status === 'blocked' && 'bg-red-400/10 text-red-300',
                      d.status === 'disabled' && 'bg-white/[0.06] text-nyven-text-secondary'
                    )}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className="text-[10px] text-nyven-text-secondary">
                    {d.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {d.notes && (
                  <p className="text-[11px] text-nyven-text-secondary/70 mt-1">{d.notes}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => toggleEnabled(d)}
                  className="text-xs px-2 py-1 rounded-lg border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text"
                >
                  {d.enabled ? 'Disable' : 'Enable'}
                </button>
                {d.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => setStatus(d.id, 'verified')}
                    className="text-xs px-2 py-1 rounded-lg border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text"
                    title="Manual mark only — not automatic DNS verification"
                  >
                    Mark verified
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStatus(d.id, 'blocked')}
                  className="text-xs px-2 py-1 rounded-lg border border-white/[0.08] text-nyven-text-secondary"
                >
                  Block
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(d.id)}
                  className="p-1.5 rounded-lg text-red-400/80 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
