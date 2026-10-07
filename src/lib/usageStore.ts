/**
 * Usage + error event tracking (localStorage until Supabase).
 * Only records data that is actually available — no invented token counts.
 */

import { getLocalOwnerId } from './agentStore'

const USAGE_KEY = 'nyven_agent_usage_v1'
const ERROR_KEY = 'nyven_agent_errors_v1'

export type UsageEventType =
  | 'message'
  | 'conversation_start'
  | 'knowledge_hit'
  | 'knowledge_gap'
  | 'rate_limited'
  | 'domain_blocked'

export interface UsageEvent {
  id: string
  agentId: string
  ownerId: string
  type: UsageEventType
  conversationId?: string
  sessionId?: string
  model?: string
  /** Only set when provider returns usage */
  promptTokens?: number
  completionTokens?: number
  knowledgeUsed?: boolean
  metadata?: Record<string, unknown>
  createdAt: string
}

export type AgentErrorKind =
  | 'provider_error'
  | 'timeout'
  | 'invalid_agent'
  | 'unauthorized'
  | 'rate_limit'
  | 'domain_blocked'
  | 'widget_error'
  | 'knowledge_error'
  | 'other'

export interface AgentErrorEvent {
  id: string
  agentId: string
  ownerId: string
  kind: AgentErrorKind
  message: string
  sessionId?: string
  createdAt: string
}

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readUsage(): UsageEvent[] {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as UsageEvent[]) : []
  } catch {
    return []
  }
}

function writeUsage(events: UsageEvent[]) {
  try {
    // Cap storage growth
    const trimmed = events.slice(-5000)
    localStorage.setItem(USAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
}

function readErrors(): AgentErrorEvent[] {
  try {
    const raw = localStorage.getItem(ERROR_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as AgentErrorEvent[]) : []
  } catch {
    return []
  }
}

function writeErrors(events: AgentErrorEvent[]) {
  try {
    localStorage.setItem(ERROR_KEY, JSON.stringify(events.slice(-2000)))
  } catch {
    /* ignore */
  }
}

export function recordUsage(
  event: Omit<UsageEvent, 'id' | 'ownerId' | 'createdAt'>
): UsageEvent {
  const ownerId = getLocalOwnerId()
  const full: UsageEvent = {
    ...event,
    id: genId('use'),
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const all = readUsage()
  all.push(full)
  writeUsage(all)
  return full
}

export function recordAgentError(
  event: Omit<AgentErrorEvent, 'id' | 'ownerId' | 'createdAt'>
): AgentErrorEvent {
  const ownerId = getLocalOwnerId()
  const full: AgentErrorEvent = {
    ...event,
    id: genId('err'),
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const all = readErrors()
  all.push(full)
  writeErrors(all)
  return full
}

export function listUsage(agentId: string): UsageEvent[] {
  const ownerId = getLocalOwnerId()
  return readUsage().filter((e) => e.agentId === agentId && e.ownerId === ownerId)
}

export function listErrors(agentId: string): AgentErrorEvent[] {
  const ownerId = getLocalOwnerId()
  return readErrors().filter((e) => e.agentId === agentId && e.ownerId === ownerId)
}

function startOfMonthISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export function countMessagesThisMonth(agentId?: string): number {
  const ownerId = getLocalOwnerId()
  const start = startOfMonthISO()
  return readUsage().filter(
    (e) =>
      e.ownerId === ownerId &&
      e.type === 'message' &&
      e.createdAt >= start &&
      (!agentId || e.agentId === agentId)
  ).length
}

export interface AgentAnalytics {
  messagesTotal: number
  messagesThisMonth: number
  conversationsApprox: number
  knowledgeHits: number
  knowledgeGaps: number
  rateLimited: number
  domainBlocked: number
  errorsTotal: number
  /** Last 14 days message counts by date YYYY-MM-DD */
  activityByDay: { date: string; messages: number }[]
  uniqueSessions: number
}

export function getAgentAnalytics(agentId: string): AgentAnalytics {
  const events = listUsage(agentId)
  const errors = listErrors(agentId)
  const start = startOfMonthISO()
  const sessions = new Set<string>()
  const convs = new Set<string>()

  let messagesTotal = 0
  let messagesThisMonth = 0
  let knowledgeHits = 0
  let knowledgeGaps = 0
  let rateLimited = 0
  let domainBlocked = 0

  const dayMap = new Map<string, number>()
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000

  for (const e of events) {
    if (e.sessionId) sessions.add(e.sessionId)
    if (e.conversationId) convs.add(e.conversationId)
    if (e.type === 'message') {
      messagesTotal += 1
      if (e.createdAt >= start) messagesThisMonth += 1
      const t = new Date(e.createdAt).getTime()
      if (t >= fourteenDaysAgo) {
        const day = e.createdAt.slice(0, 10)
        dayMap.set(day, (dayMap.get(day) || 0) + 1)
      }
    }
    if (e.type === 'knowledge_hit') knowledgeHits += 1
    if (e.type === 'knowledge_gap') knowledgeGaps += 1
    if (e.type === 'rate_limited') rateLimited += 1
    if (e.type === 'domain_blocked') domainBlocked += 1
  }

  const activityByDay: { date: string; messages: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    activityByDay.push({ date: key, messages: dayMap.get(key) || 0 })
  }

  return {
    messagesTotal,
    messagesThisMonth,
    conversationsApprox: convs.size,
    knowledgeHits,
    knowledgeGaps,
    rateLimited,
    domainBlocked,
    errorsTotal: errors.length,
    activityByDay,
    uniqueSessions: sessions.size,
  }
}
