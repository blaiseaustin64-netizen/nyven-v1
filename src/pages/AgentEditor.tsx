import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Trash2,
  Pause,
  Play,
  AlertCircle,
  Check,
  Send,
  RotateCcw,
  Copy,
  Code2,
  MessageSquare,
  BookOpen,
  History,
  BarChart3,
  Shield,
  Globe,
  Link2,
} from 'lucide-react'
import clsx from 'clsx'
import {
  AGENT_CATALOG,
  AVATAR_OPTIONS,
  COLOR_OPTIONS,
  TONE_OPTIONS,
  COMMUNICATION_STYLE_OPTIONS,
  getAgentType,
  toRuntimeConfig,
  type AgentInstance,
  type AgentStatus,
  type AgentTypeId,
} from '../lib/agentTypes'
import {
  createAgentInstance,
  listAgentInstances,
  deleteAgentInstance,
  getAgentInstance,
  publishAgentConfig,
  setAgentStatus,
  updateAgentInstance,
} from '../lib/agentStore'
import { toPublishedKnowledge, recordKnowledgeGap } from '../lib/knowledgeStore'
import {
  appendMessage,
  getOrCreateConversation,
} from '../lib/conversationStore'
import { KnowledgePanel } from '../components/agents/KnowledgePanel'
import { ConversationsPanel } from '../components/agents/ConversationsPanel'
import { DomainsPanel } from '../components/agents/DomainsPanel'
import { AnalyticsPanel } from '../components/agents/AnalyticsPanel'
import { SkillsGuardrailsPanel } from '../components/agents/SkillsGuardrailsPanel'
import { ConnectionsPanel } from '../components/agents/ConnectionsPanel'
import { applyTemplateDefaults } from '../lib/agentTemplates'
import { defaultEnabledSkills } from '../lib/skillsRegistry'
import { listActiveAllowlist } from '../lib/domainStore'
import { recordUsage, recordAgentError, countMessagesThisMonth } from '../lib/usageStore'
import { checkMessageQuota, checkAgentCount, getEntitlements } from '../lib/entitlements'

type FormState = {
  agentType: AgentTypeId
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
  personality: string
  tone: string
  communicationStyle: string
  instructions: string
  goals: string
  behaviorRules: string
  restrictions: string
  escalationRules: string
  status: AgentStatus
}

type PlayMsg = {
  id: string
  role: 'user' | 'agent' | 'error'
  content: string
  thinking?: boolean
  knowledgeUsed?: boolean
}

function defaultsFromType(typeId: AgentTypeId): FormState {
  const t = getAgentType(typeId) ?? AGENT_CATALOG[0]
  return {
    agentType: t.id,
    name: t.defaultName,
    description: t.defaultDescription,
    avatar: 'N',
    color: t.defaultColor,
    welcomeMessage: t.defaultWelcomeMessage,
    personality: t.defaultPersonality,
    tone: t.defaultTone,
    communicationStyle: 'Conversational',
    instructions: t.defaultInstructions,
    goals: t.defaultGoals,
    behaviorRules: t.defaultBehaviorRules,
    restrictions: t.defaultRestrictions,
    escalationRules: t.defaultEscalationRules,
    status: 'draft',
  }
}

function fromInstance(a: AgentInstance): FormState {
  return {
    agentType: a.agentType,
    name: a.name,
    description: a.description,
    avatar: a.avatar,
    color: a.color,
    welcomeMessage:
      a.welcomeMessage || `Hi! I'm ${a.name}. How can I help you today?`,
    personality: a.personality,
    tone: a.tone,
    communicationStyle: a.communicationStyle,
    instructions: a.instructions,
    goals: a.goals,
    behaviorRules: a.behaviorRules,
    restrictions: a.restrictions,
    escalationRules: a.escalationRules,
    status: a.status,
  }
}

function formToPartialInstance(form: FormState) {
  return {
    agentType: form.agentType,
    name: form.name,
    description: form.description,
    avatar: form.avatar,
    color: form.color,
    welcomeMessage: form.welcomeMessage,
    personality: form.personality,
    tone: form.tone,
    communicationStyle: form.communicationStyle,
    instructions: form.instructions,
    goals: form.goals,
    behaviorRules: form.behaviorRules,
    restrictions: form.restrictions,
    escalationRules: form.escalationRules,
    status: form.status,
  }
}

export function AgentEditor() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)
  const initialType = (searchParams.get('type') as AgentTypeId) || 'support'

  const [form, setForm] = useState<FormState>(() =>
    isEdit ? defaultsFromType('support') : defaultsFromType(initialType)
  )
  const [savedInstance, setSavedInstance] = useState<AgentInstance | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<'configure' | 'knowledge' | 'skills' | 'connections' | 'playground' | 'history' | 'analytics' | 'domains' | 'deploy'>(
    'configure'
  )

  const [playMessages, setPlayMessages] = useState<PlayMsg[]>([])
  const [playInput, setPlayInput] = useState('')
  const [playLoading, setPlayLoading] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const playBottomRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(
    `play_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  )
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isEdit || !id) return
    try {
      const existing = getAgentInstance(id)
      if (!existing) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setForm(fromInstance(existing))
      setSavedInstance(existing)
      setPlayMessages([
        {
          id: 'welcome',
          role: 'agent',
          content:
            existing.welcomeMessage ||
            `Hi! I'm ${existing.name}. How can I help you today?`,
        },
      ])
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id, isEdit])

  const typeDef = useMemo(() => getAgentType(form.agentType), [form.agentType])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
    setError(null)
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    if (!form.name.trim()) {
      setError('Agent name is required.')
      return
    }
    setSaving(true)
    try {
      let instance: AgentInstance
      if (!isEdit) {
        const lim = checkAgentCount(listAgentInstances().length)
        if (!lim.allowed) {
          setError(lim.reason)
          setSaving(false)
          return
        }
      }
      if (isEdit && id) {
        instance = updateAgentInstance(id, formToPartialInstance(form))
      } else {
        const tmpl = applyTemplateDefaults(form.agentType)
        instance = createAgentInstance({
          ...formToPartialInstance(form),
          settings: {
            ...tmpl.settings,
            skills: tmpl.settings.skills,
            guardrails: tmpl.settings.guardrails,
          },
        })
      }
      setSavedInstance(instance)
      setForm(fromInstance(instance))
      const agentForSettings = instance
      const pub = await publishAgentConfig(
        instance,
        toPublishedKnowledge(instance.id),
        {
          allowedDomains: listActiveAllowlist(instance.id),
          skills: agentForSettings.settings?.skills,
          guardrails: agentForSettings.settings?.guardrails,
        }
      )
      if (!pub.success) {
        setSuccess(
          isEdit
            ? 'Agent saved locally. Server publish failed — Playground still works with config in request.'
            : 'Agent created. Server publish failed — Playground still works after save.'
        )
      } else {
        setSuccess(isEdit ? 'Agent saved and published.' : 'Agent created and published.')
      }
      if (!isEdit) {
        navigate(`/agents/${instance.id}`, { replace: true })
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save agent. Please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleStatusToggle = async () => {
    if (!isEdit || !id) return
    const next: AgentStatus =
      form.status === 'active' ? 'paused' : form.status === 'paused' ? 'active' : 'active'
    setSaving(true)
    setError(null)
    try {
      const updated = setAgentStatus(id, next)
      setForm((prev) => ({ ...prev, status: updated.status }))
      setSavedInstance(updated)
      await publishAgentConfig(updated, toPublishedKnowledge(updated.id), {
        allowedDomains: listActiveAllowlist(updated.id),
        skills: updated.settings?.skills,
        guardrails: updated.settings?.guardrails,
      })
      setSuccess(next === 'active' ? 'Agent is now active.' : 'Agent paused.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !id) return
    setSaving(true)
    setError(null)
    try {
      deleteAgentInstance(id)
      navigate('/agents', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete agent.')
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const resetPlayground = () => {
    setPlayError(null)
    setPlayInput('')
    sessionIdRef.current = `play_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    setPlayMessages([
      {
        id: 'welcome',
        role: 'agent',
        content:
          form.welcomeMessage ||
          `Hi! I'm ${form.name || 'your agent'}. How can I help you today?`,
      },
    ])
  }

  const sendPlayground = async () => {
    const text = playInput.trim()
    if (!text || playLoading) return
    if (!savedInstance) {
      setPlayError('Save the agent first so the Playground can use its configuration.')
      return
    }

    const quota = checkMessageQuota(countMessagesThisMonth())
    if (!quota.allowed) {
      setPlayError(quota.reason)
      return
    }

    setPlayError(null)
    setPlayInput('')
    setPlayMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text },
      { id: `t-${Date.now()}`, role: 'agent', content: 'Thinking…', thinking: true },
    ])
    setPlayLoading(true)

    const history = playMessages
      .filter((m) => !m.thinking && m.role !== 'error')
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }))

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          agentId: savedInstance.id,
          message: text,
          history,
          sessionId: sessionIdRef.current,
          config: {
            ...toRuntimeConfig(savedInstance),
            ...formToPartialInstance(form),
            id: savedInstance.id,
          },
          knowledge: toPublishedKnowledge(savedInstance.id),
        }),
      })
      clearTimeout(timeout)
      const data = await res.json().catch(() => ({}))

      setPlayMessages((prev) => {
        const withoutThinking = prev.filter((m) => !m.thinking)
        if (res.ok && data?.success && data?.message) {
          const used = !!data.knowledgeUsed
          // Persist conversation for owner dashboard
          try {
            if (savedInstance) {
              const conv = getOrCreateConversation({
                agentId: savedInstance.id,
                sessionId: sessionIdRef.current,
                source: 'playground',
              })
              appendMessage({
                conversationId: conv.id,
                agentId: savedInstance.id,
                role: 'user',
                content: text,
              })
              appendMessage({
                conversationId: conv.id,
                agentId: savedInstance.id,
                role: 'assistant',
                content: data.message as string,
                metadata: {
                  knowledgeUsed: used,
                  knowledgeIds: Array.isArray(data.knowledgeIds) ? data.knowledgeIds : [],
                  knowledgeGap: !!data.knowledgeGap,
                },
              })
              if (data.knowledgeGap) {
                recordKnowledgeGap({
                  agentId: savedInstance.id,
                  question: text,
                  conversationId: conv.id,
                  sessionId: sessionIdRef.current,
                })
                recordUsage({
                  agentId: savedInstance.id,
                  type: 'knowledge_gap',
                  conversationId: conv.id,
                  sessionId: sessionIdRef.current,
                })
              }
              recordUsage({
                agentId: savedInstance.id,
                type: 'message',
                conversationId: conv.id,
                sessionId: sessionIdRef.current,
                model: 'gemini',
                knowledgeUsed: used,
              })
              if (used) {
                recordUsage({
                  agentId: savedInstance.id,
                  type: 'knowledge_hit',
                  conversationId: conv.id,
                  sessionId: sessionIdRef.current,
                })
              }
            }
          } catch (persistErr) {
            console.warn('conversation persist', persistErr)
          }
          return [
            ...withoutThinking,
            {
              id: `a-${Date.now()}`,
              role: 'agent' as const,
              content: data.message as string,
              knowledgeUsed: used,
            },
          ]
        }
        if (savedInstance) {
          const errText = (data?.error as string) || 'The agent could not respond.'
          const kind =
            res.status === 429
              ? 'rate_limit'
              : res.status === 403
                ? 'unauthorized'
                : res.status === 404
                  ? 'invalid_agent'
                  : 'provider_error'
          recordAgentError({
            agentId: savedInstance.id,
            kind: kind as any,
            message: errText,
            sessionId: sessionIdRef.current,
          })
          if (res.status === 429) {
            recordUsage({
              agentId: savedInstance.id,
              type: 'rate_limited',
              sessionId: sessionIdRef.current,
            })
          }
        }
        return [
          ...withoutThinking,
          {
            id: `e-${Date.now()}`,
            role: 'error' as const,
            content: (data?.error as string) || 'The agent could not respond. Please try again.',
          },
        ]
      })
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setPlayMessages((prev) => [
        ...prev.filter((m) => !m.thinking),
        {
          id: `e-${Date.now()}`,
          role: 'error',
          content: isAbort
            ? 'Request timed out. Please try again.'
            : 'Network error. Check your connection and try again.',
        },
      ])
    } finally {
      setPlayLoading(false)
      setTimeout(() => playBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  useEffect(() => {
    if (activeTab === 'playground') {
      setTimeout(() => playBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [playMessages, activeTab])

  const widgetOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-nyven-host'
  const embedCode = savedInstance
    ? `<script\n  src="${widgetOrigin}/agent.js"\n  data-agent="${savedInstance.id}">\n</script>`
    : ''

  const copyEmbed = async () => {
    if (!embedCode) return
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-nyven-cyan/30 border-t-nyven-cyan animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <AlertCircle className="mx-auto mb-4 text-nyven-text-secondary" size={36} />
          <h1 className="font-display text-xl mb-2">Agent not found</h1>
          <p className="text-nyven-text-secondary text-sm mb-6">
            This agent does not exist or you do not have access to it.
          </p>
          <button
            onClick={() => navigate('/agents')}
            className="text-nyven-cyan text-sm hover:underline"
          >
            Back to Agents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/agents')}
              className="p-2 -ml-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.04] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-medium">
                {isEdit ? 'Edit Agent' : 'Create Agent'}
              </h1>
              <p className="text-xs text-nyven-text-secondary mt-0.5">
                {typeDef?.name ?? form.agentType}
                {isEdit && (
                  <>
                    {' · '}
                    <span
                      className={clsx(
                        form.status === 'active' && 'text-emerald-400',
                        form.status === 'paused' && 'text-amber-400',
                        form.status === 'draft' && 'text-nyven-text-secondary'
                      )}
                    >
                      {form.status === 'active'
                        ? 'Active'
                        : form.status === 'paused'
                          ? 'Paused'
                          : 'Draft'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isEdit && form.status !== 'draft' && (
              <button
                onClick={handleStatusToggle}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] text-sm text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03] transition-colors disabled:opacity-50"
              >
                {form.status === 'active' ? (
                  <>
                    <Pause size={14} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={14} /> Resume
                  </>
                )}
              </button>
            )}
            {isEdit && form.status === 'draft' && (
              <button
                onClick={() => update('status', 'active')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] text-sm text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03] transition-colors"
              >
                <Play size={14} /> Mark Active
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors disabled:opacity-60"
            >
              <Save size={15} />
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
            <Check size={16} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-nyven-surface/60 border border-white/[0.05] w-fit flex-wrap">
          {(
              [
                { id: 'configure' as const, label: 'Configure', icon: Save },
                { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen, hideFor: ['inbox'] as string[] },
                { id: 'skills' as const, label: 'Skills', icon: Shield },
                { id: 'connections' as const, label: 'Connections', icon: Link2 },
                { id: 'playground' as const, label: 'Playground', icon: MessageSquare },
                { id: 'history' as const, label: 'History', icon: History },
                { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
                { id: 'domains' as const, label: 'Domains', icon: Globe, hideFor: ['inbox'] as string[] },
                { id: 'deploy' as const, label: 'Install', icon: Code2, hideFor: ['inbox'] as string[] },
              ] as const
            )
            .filter((tab) => !('hideFor' in tab && (tab as { hideFor?: string[] }).hideFor?.includes(form.agentType)))
            .map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId as typeof activeTab)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tabId
                  ? 'bg-nyven-surface text-nyven-cyan shadow-sm'
                  : 'text-nyven-text-secondary hover:text-nyven-text'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'configure' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            <div className="lg:col-span-3 space-y-6">
              {!isEdit && (
                <Section title="Agent type">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AGENT_CATALOG.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!t.available}
                        onClick={() => {
                          if (!t.available) return
                          setForm(defaultsFromType(t.id))
                        }}
                        className={clsx(
                          'text-left p-4 rounded-xl border transition-colors',
                          form.agentType === t.id && t.available
                            ? 'border-nyven-cyan/40 bg-nyven-cyan/5'
                            : 'border-white/[0.06] bg-nyven-surface/50',
                          !t.available && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{t.name}</span>
                          {t.comingSoon && (
                            <span className="text-[10px] uppercase tracking-wider text-nyven-text-secondary">
                              Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-nyven-text-secondary leading-relaxed">
                          {t.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Identity">
                <div className="space-y-4">
                  <Field label="Agent name" required>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder="e.g. Nyven Support"
                      maxLength={80}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={form.description}
                      onChange={(e) => update('description', e.target.value)}
                      rows={2}
                      maxLength={300}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Welcome message">
                    <textarea
                      value={form.welcomeMessage}
                      onChange={(e) => update('welcomeMessage', e.target.value)}
                      placeholder="First message visitors see"
                      rows={2}
                      maxLength={400}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Avatar">
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_OPTIONS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => update('avatar', a)}
                          className={clsx(
                            'w-10 h-10 rounded-xl text-sm font-semibold border transition-colors',
                            form.avatar === a
                              ? 'border-nyven-cyan/50 bg-nyven-cyan/10'
                              : 'border-white/[0.08] bg-nyven-surface hover:border-white/[0.14]'
                          )}
                          style={form.avatar === a ? { color: form.color } : undefined}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Primary color">
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => update('color', c)}
                          className={clsx(
                            'w-9 h-9 rounded-full border-2 transition-transform',
                            form.color === c
                              ? 'border-white scale-110'
                              : 'border-transparent hover:scale-105'
                          )}
                          style={{ backgroundColor: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="Personality">
                <div className="space-y-4">
                  <Field label="Tone">
                    <div className="flex flex-wrap gap-2">
                      {TONE_OPTIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => update('tone', t)}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                            form.tone === t
                              ? 'border-nyven-cyan/40 bg-nyven-cyan/10 text-nyven-cyan'
                              : 'border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text hover:border-white/[0.12]'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Communication style">
                    <div className="flex flex-wrap gap-2">
                      {COMMUNICATION_STYLE_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => update('communicationStyle', s)}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                            form.communicationStyle === s
                              ? 'border-nyven-violet/40 bg-nyven-violet/10 text-nyven-violet'
                              : 'border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text hover:border-white/[0.12]'
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Personality">
                    <textarea
                      value={form.personality}
                      onChange={(e) => update('personality', e.target.value)}
                      rows={2}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Brain"
                subtitle="Instructions and rules that drive the live agent runtime."
              >
                <div className="space-y-4">
                  <Field label="Main instructions">
                    <textarea
                      value={form.instructions}
                      onChange={(e) => update('instructions', e.target.value)}
                      rows={4}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Goals">
                    <textarea
                      value={form.goals}
                      onChange={(e) => update('goals', e.target.value)}
                      rows={3}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Behavior rules">
                    <textarea
                      value={form.behaviorRules}
                      onChange={(e) => update('behaviorRules', e.target.value)}
                      rows={3}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Restrictions">
                    <textarea
                      value={form.restrictions}
                      onChange={(e) => update('restrictions', e.target.value)}
                      rows={3}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Escalation rules">
                    <textarea
                      value={form.escalationRules}
                      onChange={(e) => update('escalationRules', e.target.value)}
                      rows={3}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </Section>

              {isEdit && (
                <Section title="Danger zone">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete agent
                    </button>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                      <p className="text-sm text-red-300 flex-1">
                        Permanently delete this agent? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="px-3 py-1.5 rounded-lg text-sm border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-lg text-sm bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {saving ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-4">
                <h2 className="font-display text-sm font-medium text-nyven-text-secondary uppercase tracking-wider">
                  Widget preview
                </h2>
                <WidgetPreview form={form} typeName={typeDef?.name} />
                <p className="text-xs text-nyven-text-secondary/70 leading-relaxed">
                  Approximate visitor view. Live AI runs in Playground and on installed
                  websites after the agent is saved and published.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'playground' && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-medium">Live Playground</h2>
                <p className="text-xs text-nyven-text-secondary mt-1">
                  {form.agentType === 'inbox' ? (
                    <>
                      Inbox Playground uses <code className="text-nyven-cyan/80">/api/agent/inbox</code> for
                      Gmail skills and <code className="text-nyven-cyan/80">/api/agent/chat</code> for reasoning.
                      Connect Gmail under Connections. Drafts are never sent without approval.
                    </>
                  ) : (
                    <>
                      Real AI via <code className="text-nyven-cyan/80">/api/agent/chat</code> using this
                      agent&apos;s Brain.
                    </>
                  )}
                  {!savedInstance && ' Save the agent first.'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetPlayground}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>

            <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col h-[min(520px,70vh)]">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 bg-nyven-bg-secondary/50">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold border border-white/[0.1]"
                  style={{ backgroundColor: `${form.color}22`, color: form.color }}
                >
                  {form.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{form.name || 'Agent'}</div>
                  <div className="text-[11px] text-nyven-text-secondary flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {form.agentType === 'inbox' ? 'Inbox · Gmail skills + Gemini' : 'Live · Gemini via NYVEN'}
                  </div>
                </div>
              </div>
              {form.agentType === 'inbox' && savedInstance && (
                <div className="px-3 py-2 border-b border-white/[0.05] flex flex-wrap gap-1.5 bg-nyven-bg/30">
                  {(
                    [
                      { label: 'Recent inbox', action: 'search', query: 'in:inbox newer_than:7d' },
                      { label: 'Needs attention', action: 'search', query: 'is:unread newer_than:14d' },
                      { label: 'This week', action: 'search', query: 'newer_than:7d' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      disabled={playLoading}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-white/[0.08] text-nyven-text-secondary hover:text-nyven-text hover:border-white/[0.14] disabled:opacity-40"
                      onClick={async () => {
                        if (!savedInstance) return
                        setPlayLoading(true)
                        setPlayMessages((prev) => [
                          ...prev,
                          { id: `u-${Date.now()}`, role: 'user', content: btn.label },
                          { id: `t-${Date.now()}`, role: 'agent', content: 'Working…', thinking: true },
                        ])
                        try {
                          const res = await fetch('/api/agent/inbox', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              agentId: savedInstance.id,
                              action: btn.action,
                              query: btn.query,
                            }),
                          })
                          const data = await res.json()
                          let content = data?.error || 'No response'
                          if (data?.success && data.messages) {
                            const lines = (data.messages as any[]).map(
                              (m, i) =>
                                `${i + 1}. ${m.subject || '(no subject)'} — ${m.from || ''}\n   ${m.snippet || ''}`
                            )
                            content =
                              lines.length > 0
                                ? `Found ${lines.length} message(s):\n\n` + lines.join('\n\n')
                                : 'No messages matched.'
                          } else if (data?.success && data.result) {
                            content = String(data.result)
                          }
                          setPlayMessages((prev) => [
                            ...prev.filter((m) => !m.thinking),
                            { id: `a-${Date.now()}`, role: data?.success ? 'agent' : 'error', content },
                          ])
                        } catch {
                          setPlayMessages((prev) => [
                            ...prev.filter((m) => !m.thinking),
                            {
                              id: `e-${Date.now()}`,
                              role: 'error',
                              content: 'Inbox request failed.',
                            },
                          ])
                        } finally {
                          setPlayLoading(false)
                        }
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-nyven-bg/40">
                {playMessages.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      'max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                      m.role === 'user' &&
                        'ml-auto bg-nyven-cyan/10 border border-nyven-cyan/20 rounded-br-md',
                      m.role === 'agent' &&
                        'bg-white/[0.04] border border-white/[0.08] rounded-bl-md',
                      m.role === 'error' &&
                        'mx-auto bg-red-500/10 border border-red-500/20 text-red-300 text-xs',
                      m.thinking && 'italic opacity-70'
                    )}
                  >
                    {m.content}
                    {m.knowledgeUsed && (
                      <div className="mt-1.5 text-[10px] text-nyven-cyan/80">
                        Answered from agent knowledge
                      </div>
                    )}
                  </div>
                ))}
                <div ref={playBottomRef} />
              </div>

              {playError && (
                <div className="px-4 py-2 text-xs text-red-300 border-t border-red-500/20 bg-red-500/5">
                  {playError}
                </div>
              )}

              <div className="p-3 border-t border-white/[0.06] flex gap-2 bg-nyven-bg-secondary/40">
                <input
                  type="text"
                  value={playInput}
                  onChange={(e) => setPlayInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendPlayground()
                    }
                  }}
                  placeholder={
                    savedInstance ? 'Ask the agent something…' : 'Save the agent to start testing'
                  }
                  disabled={playLoading || !savedInstance}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/40 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={sendPlayground}
                  disabled={playLoading || !playInput.trim() || !savedInstance}
                  className="w-11 h-11 rounded-xl bg-nyven-cyan text-nyven-bg flex items-center justify-center disabled:opacity-40 hover:bg-nyven-cyan/90 transition-colors"
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div>
            {savedInstance ? (
              <KnowledgePanel agentId={savedInstance.id} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">
                Save the agent first to manage knowledge.
              </p>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {savedInstance ? (
              <ConversationsPanel agentId={savedInstance.id} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">
                Save the agent first to view conversations.
              </p>
            )}
          </div>
        )}

        {activeTab === 'connections' && (
          <div>
            {savedInstance ? (
              <ConnectionsPanel agentId={savedInstance.id} agentType={form.agentType} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">Save the agent first.</p>
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            {savedInstance ? (
              <SkillsGuardrailsPanel agentId={savedInstance.id} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">Save the agent first.</p>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div>
            {savedInstance ? (
              <AnalyticsPanel agent={savedInstance} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">Save the agent first.</p>
            )}
          </div>
        )}

        {activeTab === 'domains' && (
          <div>
            {savedInstance ? (
              <DomainsPanel agentId={savedInstance.id} />
            ) : (
              <p className="text-sm text-nyven-text-secondary">Save the agent first.</p>
            )}
          </div>
        )}

        {activeTab === 'deploy' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="font-display text-lg font-medium">Install on your website</h2>
              <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
                Add this script to any page. Only the public agent id is exposed — never API
                keys. Save the agent as Active so the widget can load its configuration.
              </p>
            </div>

            {!savedInstance ? (
              <div className="p-5 rounded-2xl border border-dashed border-white/[0.1] text-center text-sm text-nyven-text-secondary">
                Create and save the agent first to get an install snippet.
              </div>
            ) : (
              <>
                <Section title="Installation snippet">
                  <pre className="text-xs sm:text-sm bg-nyven-bg border border-white/[0.08] rounded-xl p-4 overflow-x-auto text-nyven-text-secondary leading-relaxed whitespace-pre-wrap">
                    {embedCode}
                  </pre>
                  <button
                    type="button"
                    onClick={copyEmbed}
                    className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                  <p className="text-xs text-nyven-text-secondary mt-3">
                    Agent id: <code className="text-nyven-cyan/80">{savedInstance.id}</code>
                    {form.status !== 'active' && (
                      <span className="block mt-1 text-amber-400/90">
                        Status is {form.status}. Set to Active and Save so the live widget can
                        accept messages.
                      </span>
                    )}
                  </p>
                </Section>

                <Section title="Where to paste it">
                  <ul className="space-y-3 text-sm text-nyven-text-secondary">
                    <li>
                      <strong className="text-nyven-text">HTML</strong> — before{' '}
                      <code className="text-xs">&lt;/body&gt;</code> on pages that should show
                      the chat bubble.
                    </li>
                    <li>
                      <strong className="text-nyven-text">React / Vite</strong> — add the
                      script in <code className="text-xs">index.html</code>, or inject once in
                      a layout effect.
                    </li>
                    <li>
                      <strong className="text-nyven-text">WordPress / builders</strong> — use a
                      custom HTML / footer script block with the same snippet.
                    </li>
                  </ul>
                  <p className="text-xs text-nyven-text-secondary/70 mt-4">
                    Copying the code does not mean the agent is deployed. Visitors only get
                    responses after the agent is saved, published, and Active.
                  </p>
                </Section>

                <Section title="Security notes">
                  <ul className="text-sm text-nyven-text-secondary space-y-2 list-disc pl-4">
                    <li>The widget never receives Google or OpenRouter keys.</li>
                    <li>All model calls go through the NYVEN backend.</li>
                    <li>
                      Domain allowlists and plan-based rate limits tighten in a later phase;
                      basic per-session limits already apply.
                    </li>
                  </ul>
                </Section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm text-nyven-text placeholder:text-nyven-text-secondary/50 focus:border-nyven-cyan/40 focus:ring-1 focus:ring-nyven-cyan/20 outline-none transition-colors resize-y'

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 sm:p-6">
      <h2 className="font-display text-base font-medium mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-nyven-text-secondary mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-nyven-text-secondary mb-1.5">
        {label}
        {required && <span className="text-nyven-cyan ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function WidgetPreview({ form, typeName }: { form: FormState; typeName?: string }) {
  const statusText =
    form.status === 'active' ? 'Online' : form.status === 'paused' ? 'Paused' : 'Draft'
  const greeting =
    form.welcomeMessage.trim() ||
    (form.name.trim()
      ? `Hi! I'm ${form.name.trim()}. How can I help you today?`
      : 'Hi! How can I help you today?')

  return (
    <div className="relative">
      <div className="bg-nyven-surface border border-white/[0.08] rounded-2xl overflow-hidden shadow-nyven">
        <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center gap-3 bg-nyven-bg-secondary/40">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-semibold border border-white/[0.1]"
            style={{ backgroundColor: `${form.color}22`, color: form.color }}
          >
            {form.avatar || 'N'}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              {form.name.trim() || 'Unnamed agent'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  form.status === 'active' && 'bg-emerald-400',
                  form.status === 'paused' && 'bg-amber-400',
                  form.status === 'draft' && 'bg-nyven-text-secondary'
                )}
              />
              <span className="text-[11px] text-nyven-text-secondary">
                {statusText}
                {typeName ? ` · ${typeName}` : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3 min-h-[140px] bg-nyven-bg/30">
          <div className="flex gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 border border-white/[0.08]"
              style={{ backgroundColor: `${form.color}18`, color: form.color }}
            >
              {form.avatar || 'N'}
            </div>
            <div className="flex-1">
              <div className="inline-block px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-white/[0.04] border border-white/[0.06] text-sm leading-relaxed">
                {greeting}
              </div>
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 border-t border-white/[0.05] flex gap-2 bg-black/20">
          <div className="flex-1 h-9 rounded-xl bg-nyven-bg border border-white/[0.06]" />
          <div className="w-9 h-9 rounded-xl" style={{ backgroundColor: form.color }} />
        </div>
      </div>
      <div
        className="absolute -bottom-3 -right-3 w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-semibold border border-white/10 shadow-lg"
        style={{ backgroundColor: `${form.color}30`, color: form.color }}
      >
        {form.avatar || 'N'}
      </div>
    </div>
  )
}
