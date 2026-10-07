/**
 * Knowledge persistence (localStorage until Supabase).
 * All reads/writes scoped to current owner.
 */

import type {
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeItemInput,
  KnowledgeStatus,
  PublishedKnowledgeItem,
} from './knowledgeTypes'
import { getLocalOwnerId } from './agentStore'

const STORAGE_KEY = 'nyven_agent_knowledge_v1'
const GAPS_KEY = 'nyven_knowledge_gaps_v1'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function readAll(): KnowledgeItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as KnowledgeItem[]) : []
  } catch {
    return []
  }
}

function writeAll(items: KnowledgeItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('NYVEN knowledgeStore: persist failed', err)
    throw new Error('Could not save knowledge. Storage may be full.')
  }
}

export function listKnowledge(agentId: string): KnowledgeItem[] {
  const ownerId = getLocalOwnerId()
  return readAll()
    .filter((k) => k.agentId === agentId && k.ownerId === ownerId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function listActiveKnowledge(agentId: string): KnowledgeItem[] {
  return listKnowledge(agentId).filter((k) => k.status === 'active')
}

export function getKnowledgeItem(id: string): KnowledgeItem | null {
  const ownerId = getLocalOwnerId()
  return readAll().find((k) => k.id === id && k.ownerId === ownerId) ?? null
}

export function createKnowledgeItem(input: KnowledgeItemInput): KnowledgeItem {
  const ownerId = getLocalOwnerId()
  const now = new Date().toISOString()
  const item: KnowledgeItem = {
    id: generateId('kn'),
    ownerId,
    agentId: input.agentId,
    type: input.type,
    title: input.title.trim(),
    content: input.content.trim(),
    answer: input.answer?.trim(),
    category: input.category?.trim() || undefined,
    status: input.status || 'active',
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  }
  const all = readAll()
  all.push(item)
  writeAll(all)
  return item
}

export function updateKnowledgeItem(
  id: string,
  patch: Partial<KnowledgeItemInput>
): KnowledgeItem {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const idx = all.findIndex((k) => k.id === id && k.ownerId === ownerId)
  if (idx === -1) throw new Error('Knowledge item not found or access denied.')
  const existing = all[idx]
  const updated: KnowledgeItem = {
    ...existing,
    ...patch,
    id: existing.id,
    ownerId: existing.ownerId,
    agentId: existing.agentId,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    content: patch.content !== undefined ? patch.content.trim() : existing.content,
    answer: patch.answer !== undefined ? patch.answer.trim() : existing.answer,
    updatedAt: new Date().toISOString(),
  }
  all[idx] = updated
  writeAll(all)
  return updated
}

export function setKnowledgeStatus(id: string, status: KnowledgeStatus): KnowledgeItem {
  return updateKnowledgeItem(id, { status })
}

export function deleteKnowledgeItem(id: string): void {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const next = all.filter((k) => !(k.id === id && k.ownerId === ownerId))
  if (next.length === all.length) throw new Error('Knowledge item not found or access denied.')
  writeAll(next)
}

export function toPublishedKnowledge(agentId: string): PublishedKnowledgeItem[] {
  return listActiveKnowledge(agentId).map((k) => ({
    id: k.id,
    type: k.type,
    title: k.title,
    content: k.content,
    answer: k.answer,
    category: k.category,
    status: k.status,
  }))
}

/* ——— Knowledge gaps ——— */

function readGaps(): KnowledgeGap[] {
  try {
    const raw = localStorage.getItem(GAPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as KnowledgeGap[]) : []
  } catch {
    return []
  }
}

function writeGaps(gaps: KnowledgeGap[]): void {
  try {
    localStorage.setItem(GAPS_KEY, JSON.stringify(gaps))
  } catch {
    /* ignore */
  }
}

export function listKnowledgeGaps(agentId: string): KnowledgeGap[] {
  const ownerId = getLocalOwnerId()
  return readGaps()
    .filter((g) => g.agentId === agentId && g.ownerId === ownerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function recordKnowledgeGap(input: {
  agentId: string
  question: string
  conversationId?: string
  sessionId?: string
}): KnowledgeGap {
  const ownerId = getLocalOwnerId()
  const gap: KnowledgeGap = {
    id: generateId('gap'),
    ownerId,
    agentId: input.agentId,
    question: input.question.trim().slice(0, 2000),
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    resolved: false,
  }
  const all = readGaps()
  // Dedupe similar recent questions
  const exists = all.some(
    (g) =>
      g.agentId === gap.agentId &&
      g.ownerId === ownerId &&
      g.question.toLowerCase() === gap.question.toLowerCase() &&
      !g.resolved
  )
  if (!exists) {
    all.push(gap)
    writeGaps(all)
  }
  return gap
}

export function resolveKnowledgeGap(id: string): void {
  const ownerId = getLocalOwnerId()
  const all = readGaps()
  const idx = all.findIndex((g) => g.id === id && g.ownerId === ownerId)
  if (idx === -1) return
  all[idx] = { ...all[idx], resolved: true }
  writeGaps(all)
}

export function deleteKnowledgeGap(id: string): void {
  const ownerId = getLocalOwnerId()
  writeGaps(readGaps().filter((g) => !(g.id === id && g.ownerId === ownerId)))
}
