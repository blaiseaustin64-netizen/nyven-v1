import { useMemo, useState, useEffect } from 'react'
import type { AgentInstance } from '../../lib/agentTypes'
import {
  getAgentAnalytics,
  listErrors,
  countMessagesThisMonth,
  type AgentAnalytics,
  type AgentErrorEvent,
} from '../../lib/usageStore'
import { computeAgentHealth, type AgentHealthResult } from '../../lib/agentHealth'
import { getTopKnowledgeGaps, type GapGroup } from '../../lib/gapInsights'
import { getEntitlements } from '../../lib/entitlements'

type Props = { agent: AgentInstance }

const EMPTY_ANALYTICS: AgentAnalytics = {
  messagesTotal: 0,
  messagesThisMonth: 0,
  conversationsApprox: 0,
  knowledgeHits: 0,
  knowledgeGaps: 0,
  rateLimited: 0,
  domainBlocked: 0,
  errorsTotal: 0,
  activityByDay: Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000)
    return { date: d.toISOString().slice(0, 10), messages: 0 }
  }),
  uniqueSessions: 0,
}

const EMPTY_HEALTH: AgentHealthResult = {
  score: 0,
  factors: [],
  suggestions: [],
}

export function AnalyticsPanel({ agent }: Props) {
  const [crash, setCrash] = useState<string | null>(null)

  const analytics = useMemo((): AgentAnalytics => {
    try {
      if (!agent?.id) return EMPTY_ANALYTICS
      const data = getAgentAnalytics(agent.id)
      if (!data || !Array.isArray(data.activityByDay)) {
        return { ...EMPTY_ANALYTICS, ...data, activityByDay: EMPTY_ANALYTICS.activityByDay }
      }
      return data
    } catch (e) {
      console.error('Analytics getAgentAnalytics failed', e)
      return EMPTY_ANALYTICS
    }
  }, [agent?.id])

  const health = useMemo((): AgentHealthResult => {
    try {
      if (!agent) return EMPTY_HEALTH
      return computeAgentHealth(agent)
    } catch (e) {
      console.error('Analytics computeAgentHealth failed', e)
      return EMPTY_HEALTH
    }
  }, [agent])

  const topGaps = useMemo((): GapGroup[] => {
    try {
      if (!agent?.id) return []
      return getTopKnowledgeGaps(agent.id, 8) || []
    } catch {
      return []
    }
  }, [agent?.id])

  const errors = useMemo((): AgentErrorEvent[] => {
    try {
      if (!agent?.id) return []
      return (listErrors(agent.id) || []).slice(0, 8)
    } catch {
      return []
    }
  }, [agent?.id])

  const entitlements = useMemo(() => {
    try {
      return getEntitlements()
    } catch {
      return {
        planId: 'free' as const,
        label: 'Free',
        maxAgents: 3,
        maxMessagesPerMonth: 500,
        maxKnowledgeItems: 50,
        maxDomainsPerAgent: 3,
        rateLimitPerMinute: 30,
        rateLimitPerSessionPerMinute: 20,
        allowCustomModels: false,
        connectedTools: 0,
      }
    }
  }, [])

  const monthUsed = useMemo(() => {
    try {
      return agent?.id ? countMessagesThisMonth(agent.id) : 0
    } catch {
      return 0
    }
  }, [agent?.id])

  const activity = Array.isArray(analytics.activityByDay)
    ? analytics.activityByDay
    : EMPTY_ANALYTICS.activityByDay

  const maxBar = Math.max(
    1,
    ...activity.map((d) => (typeof d.messages === 'number' ? d.messages : 0))
  )

  const avgPerConv =
    analytics.conversationsApprox > 0
      ? (analytics.messagesTotal / analytics.conversationsApprox).toFixed(1)
      : '—'

  useEffect(() => {
    setCrash(null)
  }, [agent?.id])

  if (!agent?.id) {
    return (
      <div className="max-w-3xl py-8 text-sm text-nyven-text-secondary">
        Save the agent first to see analytics.
      </div>
    )
  }

  if (crash) {
    return (
      <div className="max-w-3xl p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
        Analytics could not load: {crash}
      </div>
    )
  }

  try {
    return (
      <div className="max-w-3xl space-y-8 pb-12">
        <div>
          <h2 className="font-display text-lg font-medium text-nyven-text">Analytics</h2>
          <p className="text-sm text-nyven-text-secondary mt-1">
            Real metrics from this device&apos;s recorded usage
            {agent.agentType === 'inbox'
              ? ' (Inbox: searches, drafts, and actions when recorded).'
              : ' (Support: conversations and knowledge).'}{' '}
            Empty until the agent is used.
          </p>
        </div>

        <section className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-medium text-nyven-text-secondary">Agent Health</h3>
              <p className="font-display text-3xl font-medium mt-1 tabular-nums text-nyven-text">
                {health.score}
                <span className="text-lg text-nyven-text-secondary"> / 100</span>
              </p>
            </div>
          </div>
          {(health.factors || []).length > 0 ? (
            <ul className="space-y-2 mb-4">
              {health.factors.map((f) => (
                <li key={f.id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-nyven-text-secondary">{f.label}</span>
                    <span className="tabular-nums text-nyven-text">{f.score}</span>
                  </div>
                  <p className="text-[11px] text-nyven-text-secondary/70 mt-0.5">{f.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-nyven-text-secondary mb-4">
              Health factors will appear once the agent is configured.
            </p>
          )}
          {(health.suggestions || []).length > 0 && (
            <div className="border-t border-white/[0.06] pt-3">
              <p className="text-xs font-medium text-nyven-text-secondary mb-1.5">Suggestions</p>
              <ul className="text-xs text-nyven-text-secondary space-y-1 list-disc pl-4">
                {health.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Messages" value={String(analytics.messagesTotal ?? 0)} />
          <Stat
            label="This month"
            value={`${monthUsed} / ${entitlements.maxMessagesPerMonth}`}
          />
          <Stat label="Conversations" value={String(analytics.conversationsApprox ?? 0)} />
          <Stat label="Sessions" value={String(analytics.uniqueSessions ?? 0)} />
          <Stat label="Avg msgs / conv" value={String(avgPerConv)} />
          <Stat label="Knowledge hits" value={String(analytics.knowledgeHits ?? 0)} />
        </div>

        <section>
          <h3 className="text-sm font-medium mb-3 text-nyven-text">Activity (14 days)</h3>
          {(analytics.messagesTotal ?? 0) === 0 ? (
            <Empty text="Usage data will appear after your agent receives messages." />
          ) : (
            <div className="flex items-end gap-1 h-24">
              {activity.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                >
                  <div
                    className="w-full rounded-t bg-nyven-cyan/40 min-h-[2px]"
                    style={{
                      height: `${((d.messages || 0) / maxBar) * 100}%`,
                    }}
                    title={`${d.date}: ${d.messages || 0}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {agent.agentType !== 'inbox' && (
          <section>
            <h3 className="text-sm font-medium mb-3 text-nyven-text">Top knowledge gaps</h3>
            <p className="text-[11px] text-nyven-text-secondary mb-2">
              Grouped by normalized wording (not semantic clustering).
            </p>
            {topGaps.length === 0 ? (
              <Empty text="No knowledge gaps detected." />
            ) : (
              <ol className="space-y-2">
                {topGaps.map((g, i) => (
                  <li
                    key={g.key}
                    className="flex items-start justify-between gap-3 p-3 rounded-xl border border-white/[0.06] bg-nyven-surface text-sm"
                  >
                    <span className="text-nyven-text">
                      <span className="text-nyven-text-secondary mr-2">{i + 1}.</span>
                      {g.sampleQuestion}
                    </span>
                    <span className="text-xs text-nyven-text-secondary shrink-0">
                      Asked {g.count} time{g.count === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section>
          <h3 className="text-sm font-medium mb-3 text-nyven-text">Recent issues</h3>
          {errors.length === 0 ? (
            <Empty text="No recorded failures." />
          ) : (
            <ul className="space-y-2">
              {errors.map((e) => (
                <li
                  key={e.id}
                  className="text-sm p-3 rounded-xl border border-white/[0.06] bg-nyven-surface"
                >
                  <span className="text-[10px] uppercase tracking-wider text-amber-400/90">
                    {e.kind}
                  </span>
                  <p className="text-nyven-text-secondary mt-0.5">{e.message}</p>
                  <p className="text-[11px] text-nyven-text-secondary/60 mt-1">
                    {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('AnalyticsPanel render failed', e)
    return (
      <div className="max-w-3xl p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-300">
        Analytics failed to render: {msg}
      </div>
    )
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-nyven-surface">
      <div className="text-[11px] text-nyven-text-secondary">{label}</div>
      <div className="text-lg font-medium tabular-nums mt-1 text-nyven-text">{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-sm text-nyven-text-secondary py-6 text-center border border-dashed border-white/[0.08] rounded-xl">
      {text}
    </p>
  )
}
