/**
 * Knowledge gap grouping — basic normalized string matching, not semantic clustering.
 */

import type { KnowledgeGap } from './knowledgeTypes'
import { listKnowledgeGaps } from './knowledgeStore'

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
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
  const gaps = listKnowledgeGaps(agentId).filter((g) => !g.resolved)
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
        sampleQuestion: g.question,
        count: 1,
        latestAt: g.createdAt,
        gapIds: [g.id],
      })
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}
