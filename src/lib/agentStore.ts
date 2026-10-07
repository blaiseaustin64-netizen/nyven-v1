/**
 * NYVEN Agents persistence layer.
 *
 * Phase 1 found no Supabase. This store uses localStorage with a schema
 * that maps 1:1 to the planned `agent_instances` table so migration is
 * straightforward when auth + Supabase arrive.
 *
 * Ownership: a stable local ownerId is used until real auth exists.
 * All CRUD is scoped to that ownerId (mirrors future server-side checks).
 */

import type {
  AgentInstance,
  AgentInstanceInput,
  AgentRuntimeConfig,
  AgentStatus,
  AgentTypeId,
} from './agentTypes'
import { toRuntimeConfig } from './agentTypes'

const STORAGE_KEY = 'nyven_agent_instances_v1'
const OWNER_KEY = 'nyven_local_owner_id'

function generateId(): string {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/** Stable local owner identity until Supabase auth is wired */
export function getLocalOwnerId(): string {
  try {
    let id = localStorage.getItem(OWNER_KEY)
    if (!id) {
      id = `owner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(OWNER_KEY, id)
    }
    return id
  } catch {
    return 'owner_anonymous'
  }
}

function readAll(): AgentInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Migrate older records missing welcomeMessage
    return (parsed as AgentInstance[]).map((a) => ({
      ...a,
      welcomeMessage:
        a.welcomeMessage ||
        (a.name ? `Hi! I'm ${a.name}. How can I help you today?` : "Hi! How can I help you today?"),
    }))
  } catch {
    return []
  }
}

function writeAll(instances: AgentInstance[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instances))
  } catch (err) {
    console.error('NYVEN agentStore: failed to persist', err)
    throw new Error('Could not save agents. Storage may be full or unavailable.')
  }
}

/** List only the current owner's agents */
export function listAgentInstances(): AgentInstance[] {
  const ownerId = getLocalOwnerId()
  return readAll()
    .filter((a) => a.ownerId === ownerId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getAgentInstance(id: string): AgentInstance | null {
  const ownerId = getLocalOwnerId()
  const found = readAll().find((a) => a.id === id && a.ownerId === ownerId)
  return found ?? null
}

export function createAgentInstance(input: AgentInstanceInput): AgentInstance {
  const ownerId = getLocalOwnerId()
  const now = new Date().toISOString()
  const instance: AgentInstance = {
    id: generateId(),
    ownerId,
    agentType: input.agentType,
    name: input.name.trim(),
    description: input.description.trim(),
    avatar: input.avatar || 'N',
    color: input.color || '#62E6FF',
    welcomeMessage:
      input.welcomeMessage?.trim() ||
      `Hi! I'm ${input.name.trim() || 'your assistant'}. How can I help you today?`,
    personality: input.personality || '',
    tone: input.tone || 'Professional',
    communicationStyle: input.communicationStyle || 'Conversational',
    instructions: input.instructions || '',
    goals: input.goals || '',
    behaviorRules: input.behaviorRules || '',
    restrictions: input.restrictions || '',
    escalationRules: input.escalationRules || '',
    status: input.status || 'draft',
    settings: input.settings || {},
    createdAt: now,
    updatedAt: now,
  }

  const all = readAll()
  all.push(instance)
  writeAll(all)
  return instance
}

export function updateAgentInstance(
  id: string,
  patch: Partial<AgentInstanceInput>
): AgentInstance {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const idx = all.findIndex((a) => a.id === id && a.ownerId === ownerId)
  if (idx === -1) {
    throw new Error('Agent not found or you do not have access.')
  }

  const existing = all[idx]
  const updated: AgentInstance = {
    ...existing,
    ...patch,
    id: existing.id,
    ownerId: existing.ownerId,
    agentType: (patch.agentType as AgentTypeId) || existing.agentType,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    description:
      patch.description !== undefined ? patch.description.trim() : existing.description,
    welcomeMessage:
      patch.welcomeMessage !== undefined
        ? patch.welcomeMessage.trim()
        : existing.welcomeMessage,
    updatedAt: new Date().toISOString(),
  }

  all[idx] = updated
  writeAll(all)
  return updated
}

export function setAgentStatus(id: string, status: AgentStatus): AgentInstance {
  return updateAgentInstance(id, { status })
}

export function deleteAgentInstance(id: string): void {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const next = all.filter((a) => !(a.id === id && a.ownerId === ownerId))
  if (next.length === all.length) {
    throw new Error('Agent not found or you do not have access.')
  }
  writeAll(next)
}

/**
 * Publish agent runtime config to the backend registry so the website
 * widget and /api/agent/chat can load Brain without secrets in the browser.
 * Best-effort — playground always sends config in the chat body as well.
 */
export async function publishAgentConfig(
  agent: AgentInstance,
  knowledge?: import('./knowledgeTypes').PublishedKnowledgeItem[],
  extra?: {
    allowedDomains?: string[]
    skills?: unknown
    guardrails?: unknown
  }
): Promise<{ success: boolean; error?: string }> {
  const config: AgentRuntimeConfig = toRuntimeConfig(agent)
  try {
    const res = await fetch('/api/agent/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        knowledge: knowledge || [],
        allowedDomains: extra?.allowedDomains || [],
        skills: extra?.skills,
        guardrails: extra?.guardrails,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: string
    }
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to publish agent configuration.',
      }
    }
    return { success: true }
  } catch {
    return {
      success: false,
      error: 'Could not reach the server to publish this agent.',
    }
  }
}
