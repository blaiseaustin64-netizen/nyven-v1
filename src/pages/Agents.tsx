import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bot,
  Plus,
  Clock,
  ChevronRight,
  Sparkles,
  Lock,
} from 'lucide-react'
import clsx from 'clsx'
import {
  AGENT_CATALOG,
  getAgentType,
  type AgentInstance,
  type AgentStatus,
} from '../lib/agentTypes'
import { listAgentInstances } from '../lib/agentStore'

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    default:
      return 'Draft'
  }
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'active':
      return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    case 'paused':
      return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    default:
      return 'text-nyven-text-secondary bg-white/[0.04] border-white/[0.08]'
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export function Agents() {
  const navigate = useNavigate()
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    try {
      setInstances(listAgentInstances())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const availableTypes = AGENT_CATALOG.filter((t) => t.available)
  const comingSoonTypes = AGENT_CATALOG.filter((t) => t.comingSoon)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 pb-24 lg:pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight">
              Agents
            </h1>
            <p className="text-nyven-text-secondary text-sm mt-2 max-w-xl leading-relaxed">
              Specialized AI workers you configure and deploy for specific jobs —
              support, inbox, and more. Built on NYVEN intelligence.
            </p>
          </div>
          <button
            onClick={() => navigate('/agents/create')}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors shrink-0 min-h-[44px]"
          >
            <Plus size={16} strokeWidth={2.25} />
            Create Agent
          </button>
        </div>

        {/* My Agents */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium">My Agents</h2>
            {!loading && instances.length > 0 && (
              <span className="text-xs text-nyven-text-secondary">
                {instances.length} agent{instances.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-nyven-surface/50 border border-white/[0.04] animate-pulse"
                />
              ))}
            </div>
          ) : instances.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 sm:py-20 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-nyven-surface/30 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-nyven-surface border border-white/[0.06] flex items-center justify-center mb-5">
                <Bot size={26} className="text-nyven-cyan opacity-80" />
              </div>
              <h3 className="font-display text-lg font-medium mb-2">
                Create your first AI agent
              </h3>
              <p className="text-nyven-text-secondary text-sm max-w-sm mb-6 leading-relaxed">
                Configure a specialized agent with its own identity, personality,
                and instructions — then prepare it for deployment.
              </p>
              <button
                onClick={() => navigate('/agents/create')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors"
              >
                <Plus size={16} />
                Create Agent
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {instances.map((agent, i) => {
                const typeDef = getAgentType(agent.agentType)
                return (
                  <motion.article
                    key={agent.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    className="group relative bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition-colors cursor-pointer"
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold shrink-0 border border-white/[0.08]"
                        style={{
                          backgroundColor: `${agent.color}18`,
                          color: agent.color,
                        }}
                      >
                        {agent.avatar || 'N'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-[15px] truncate">
                            {agent.name}
                          </h3>
                          <span
                            className={clsx(
                              'text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                              statusColor(agent.status)
                            )}
                          >
                            {statusLabel(agent.status)}
                          </span>
                        </div>
                        <p className="text-xs text-nyven-text-secondary mt-0.5">
                          {typeDef?.name ?? agent.agentType}
                        </p>
                        {agent.description && (
                          <p className="text-sm text-nyven-text-secondary mt-2 line-clamp-2 leading-relaxed">
                            {agent.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <span className="flex items-center gap-1.5 text-[11px] text-nyven-text-secondary/70">
                            <Clock size={12} />
                            {formatRelative(agent.updatedAt)}
                          </span>
                          <span className="text-xs text-nyven-cyan opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            Open
                            <ChevronRight size={14} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          )}
        </section>

        {/* Agent Catalog */}
        <section>
          <h2 className="font-display text-lg font-medium mb-1">Agent Catalog</h2>
          <p className="text-nyven-text-secondary text-sm mb-5">
            Choose a specialized agent type to configure.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {availableTypes.map((type, i) => (
              <motion.div
                key={type.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.04 }}
                className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 hover:border-nyven-cyan/25 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.08]"
                    style={{
                      backgroundColor: `${type.defaultColor}18`,
                      color: type.defaultColor,
                    }}
                  >
                    <Sparkles size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[15px]">{type.name}</h3>
                      <span className="text-[10px] uppercase tracking-wider font-medium text-nyven-cyan bg-nyven-cyan/10 px-1.5 py-0.5 rounded">
                        Available
                      </span>
                    </div>
                    <p className="text-xs text-nyven-text-secondary mt-0.5">
                      {type.category}
                    </p>
                    <p className="text-sm text-nyven-text-secondary mt-2 leading-relaxed">
                      {type.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {type.capabilities.slice(0, 3).map((cap) => (
                        <span
                          key={cap}
                          className="text-[11px] text-nyven-text-secondary bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() =>
                        navigate(`/agents/create?type=${type.id}`)
                      }
                      className="mt-4 inline-flex items-center gap-1.5 text-sm text-nyven-cyan hover:text-nyven-cyan/80 font-medium transition-colors"
                    >
                      Configure
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {comingSoonTypes.map((type, i) => (
              <motion.div
                key={type.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                className="relative bg-nyven-surface/60 border border-white/[0.04] rounded-2xl p-5 opacity-75"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06] bg-white/[0.03]"
                    style={{ color: type.defaultColor }}
                  >
                    <Lock size={18} className="opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[15px] text-nyven-text-secondary">
                        {type.name}
                      </h3>
                      <span className="text-[10px] uppercase tracking-wider font-medium text-nyven-text-secondary/80 bg-white/[0.04] px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-xs text-nyven-text-secondary/70 mt-0.5">
                      {type.category}
                    </p>
                    <p className="text-sm text-nyven-text-secondary/70 mt-2 leading-relaxed">
                      {type.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
