/**
 * Knowledge gap grouping — basic normalized string matching, not semantic clustering.
 * Avoid Unicode property escapes (\p{}) for wider browser support.
 */

import { listKnowledgeGaps } from './knowledgeStore'

function normalizeQuestion(q: string): string {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\u00c0-\u024f]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export interface GapGroup {
  key: string
  sampleQuestion: string
  count: number
  latestAt: string
  gapIds: string[]
}

export function getTopKnowledgeGaps(agentId: string, limit = 10): GapGroup[] {
  try {
    const gaps = listKnowledgeGaps(agentId).filter((g) => g && !g.resolved)
    const map = new Map<string, GapGroup>()

    for (const g of gaps) {
      const key = normalizeQuestion(g.question)
      if (!key) continue
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        existing.gapIds.push(g.id)
        if (g.createdAt > existing.latestAt) {
          existing.latestAt = g.createdAt
          existing.sampleQuestion = g.question
        }
      } else {
        map.set(key, {
          key,
          sampleQuestion: g.question || key,
          count: 1,
          latestAt: g.createdAt || new Date().toISOString(),
          gapIds: [g.id],
        })
      }
    }

    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit)
  } catch {
    return []
  }
}
