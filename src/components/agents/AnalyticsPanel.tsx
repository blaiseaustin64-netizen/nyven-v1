import { useMemo } from 'react'
import type { AgentInstance } from '../../lib/agentTypes'
import { getAgentAnalytics, listErrors } from '../../lib/usageStore'
import { computeAgentHealth } from '../../lib/agentHealth'
import { getTopKnowledgeGaps } from '../../lib/gapInsights'
import { getEntitlements } from '../../lib/entitlements'
import { countMessagesThisMonth } from '../../lib/usageStore'

type Props = { agent: AgentInstance }

export function AnalyticsPanel({ agent }: Props) {
  const analytics = useMemo(() => getAgentAnalytics(agent.id), [agent.id])
  const health = useMemo(() => computeAgentHealth(agent), [agent])
  const topGaps = useMemo(() => getTopKnowledgeGaps(agent.id, 8), [agent.id])
  const errors = useMemo(() => listErrors(agent.id).slice(0, 8), [agent.id])
  const entitlements = getEntitlements()
  const monthUsed = countMessagesThisMonth(agent.id)
  const maxBar = Math.max(1, ...analytics.activityByDay.map((d) => d.messages))

  const avgPerConv =
    analytics.conversationsApprox > 0
      ? (analytics.messagesTotal / analytics.conversationsApprox).toFixed(1)
      : '—'

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="font-display text-lg font-medium">Analytics</h2>
        <p className="text-sm text-nyven-text-secondary mt-1">
          Real metrics from this device&apos;s recorded usage
          {agent.agentType === 'inbox'
            ? ' (Inbox: searches, drafts, and actions when recorded).'
            : ' (Support: conversations and knowledge).'}{' '}
          Empty until the agent is used.
        </p>
      </div>

      {/* Health */}
      <section className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-medium text-nyven-text-secondary">Agent Health</h3>
            <p className="font-display text-3xl font-medium mt-1 tabular-nums">
              {health.score}
              <span className="text-lg text-nyven-text-secondary"> / 100</span>
            </p>
          </div>
        </div>
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
        {health.suggestions.length > 0 && (
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

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Messages" value={String(analytics.messagesTotal)} />
        <Stat label="This month" value={`${monthUsed} / ${entitlements.maxMessagesPerMonth}`} />
        <Stat label="Conversations" value={String(analytics.conversationsApprox)} />
        <Stat label="Sessions" value={String(analytics.uniqueSessions)} />
        <Stat label="Avg msgs / conv" value={String(avgPerConv)} />
        <Stat label="Knowledge hits" value={String(analytics.knowledgeHits)} />
      </div>

      {/* Activity */}
      <section>
        <h3 className="text-sm font-medium mb-3">Activity (14 days)</h3>
        {analytics.messagesTotal === 0 ? (
          <Empty text="Usage data will appear after your agent receives messages." />
        ) : (
          <div className="flex items-end gap-1 h-24">
            {analytics.activityByDay.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div
                  className="w-full rounded-t bg-nyven-cyan/40 min-h-[2px]"
                  style={{ height: `${(d.messages / maxBar) * 100}%` }}
                  title={`${d.date}: ${d.messages}`}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Knowledge gaps */}
      <section>
        <h3 className="text-sm font-medium mb-3">Top knowledge gaps</h3>
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
                <span>
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

      {/* Errors */}
      <section>
        <h3 className="text-sm font-medium mb-3">Recent issues</h3>
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
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-nyven-surface">
      <div className="text-[11px] text-nyven-text-secondary">{label}</div>
      <div className="text-lg font-medium tabular-nums mt-1">{value}</div>
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
