import { useEffect, useState } from 'react'
import type { AgentInstance } from '../../lib/agentTypes'
import {
  DEFAULT_GUARDRAILS,
  DEFAULT_SUPPORT_SKILLS,
  type AgentGuardrails,
  type AgentSkill,
} from '../../lib/skillsGuardrails'
import { defaultEnabledSkills } from '../../lib/skillsRegistry'
import { updateAgentInstance, publishAgentConfig, getAgentInstance } from '../../lib/agentStore'
import { toPublishedKnowledge } from '../../lib/knowledgeStore'
import { listActiveAllowlist } from '../../lib/domainStore'
import clsx from 'clsx'

type Props = { agentId: string }

function loadSkills(agent: AgentInstance | null): AgentSkill[] {
  const raw = agent?.settings?.skills
  if (Array.isArray(raw) && raw.length) return raw as AgentSkill[]
  if (agent?.agentType === 'inbox') {
    return defaultEnabledSkills('inbox').map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      enabled: s.enabled,
    }))
  }
  return DEFAULT_SUPPORT_SKILLS.map((s) => ({ ...s }))
}

function loadGuardrails(agent: AgentInstance | null): AgentGuardrails {
  const raw = agent?.settings?.guardrails
  if (raw && typeof raw === 'object') {
    return { ...DEFAULT_GUARDRAILS, ...(raw as AgentGuardrails) }
  }
  return { ...DEFAULT_GUARDRAILS }
}

export function SkillsGuardrailsPanel({ agentId }: Props) {
  const [skills, setSkills] = useState<AgentSkill[]>(DEFAULT_SUPPORT_SKILLS)
  const [guardrails, setGuardrails] = useState<AgentGuardrails>(DEFAULT_GUARDRAILS)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const agent = getAgentInstance(agentId)
    setSkills(loadSkills(agent))
    setGuardrails(loadGuardrails(agent))
  }, [agentId])

  const persist = async () => {
    setError(null)
    setSaved(false)
    try {
      const agent = updateAgentInstance(agentId, {
        settings: {
          ...(getAgentInstance(agentId)?.settings || {}),
          skills,
          guardrails,
        },
      })
      await publishAgentConfig(agent, toPublishedKnowledge(agentId), {
        allowedDomains: listActiveAllowlist(agentId),
        skills,
        guardrails,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="font-display text-lg font-medium">Skills & Guardrails</h2>
        <p className="text-sm text-nyven-text-secondary mt-1">
          Skills describe what the agent may do. Guardrails are injected into the live system
          prompt — not cosmetic.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <section>
        <h3 className="text-sm font-medium mb-3">Skills</h3>
        <ul className="space-y-2">
          {skills.map((s, i) => (
            <li
              key={s.id}
              className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-nyven-surface"
            >
              <button
                type="button"
                onClick={() => {
                  const next = [...skills]
                  next[i] = { ...s, enabled: !s.enabled }
                  setSkills(next)
                }}
                className={clsx(
                  'mt-0.5 w-9 h-5 rounded-full relative transition-colors shrink-0',
                  s.enabled ? 'bg-nyven-cyan/80' : 'bg-white/10'
                )}
                aria-pressed={s.enabled}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                    s.enabled ? 'left-4' : 'left-0.5'
                  )}
                />
              </button>
              <div>
                <div className="text-sm font-medium">{s.label}</div>
                <p className="text-xs text-nyven-text-secondary mt-0.5">{s.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Guardrails</h3>
        {(
          [
            ['topicsToAvoid', 'Topics to avoid'],
            ['mustNotInvent', 'Must not invent'],
            ['whenToSayUnknown', 'When to say "I don\'t know"'],
            ['whenToEscalate', 'When to escalate'],
            ['restrictedActions', 'Restricted actions'],
            ['responseBoundaries', 'Response boundaries'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="text-xs text-nyven-text-secondary mb-1 block">{label}</span>
            <textarea
              className="w-full px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/40 resize-y"
              rows={2}
              value={guardrails[key]}
              onChange={(e) => setGuardrails({ ...guardrails, [key]: e.target.value })}
            />
          </label>
        ))}
      </section>

      <button
        type="button"
        onClick={persist}
        className="px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
      >
        {saved ? 'Saved' : 'Save skills & guardrails'}
      </button>

      <section className="opacity-70">
        <h3 className="text-sm font-medium mb-2">Connections</h3>
        <p className="text-xs text-nyven-text-secondary leading-relaxed">
          Foundation only. Website domains are managed under Domains. Gmail, APIs, MCP, and
          VEXDYN tools will plug in here later — not implemented in this phase.
        </p>
        <ul className="mt-3 text-xs text-nyven-text-secondary space-y-1">
          <li>· Websites / domains — active</li>
          <li>· Gmail — coming later</li>
          <li>· APIs / MCP — coming later</li>
        </ul>
      </section>
    </div>
  )
}
