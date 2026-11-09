/**
 * Cross-chat memory: storage, retrieval, extraction filters, past-chat recall.
 * Server-side only. Never expose provider names in user-facing text.
 */
import type { D1Database } from '../db/types'

const MAX_CONTENT = 500
const RETRIEVAL_CHAR_BUDGET = 3200 // ~800 tokens rough

export type MemoryRow = {
  id: string
  user_id: string
  content: string
  memory_type: string
  source: string | null
  enabled: number
  created_at: string
  updated_at: string
  project_id?: string | null
  source_conversation_id?: string | null
  pinned?: number
}

export async function ensureMemorySchema(db: D1Database): Promise<void> {
  for (const sql of [
    `ALTER TABLE user_memories ADD COLUMN project_id TEXT`,
    `ALTER TABLE user_memories ADD COLUMN source_conversation_id TEXT`,
    `ALTER TABLE user_memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE conversations ADD COLUMN summary TEXT`,
    `ALTER TABLE conversations ADD COLUMN topic_keywords TEXT`,
  ]) {
    try {
      await db.prepare(sql).run()
    } catch {
      /* exists */
    }
  }
}

/** Reject sensitive / non-durable content. */
export function isSensitiveOrForbidden(text: string): boolean {
  const t = text.toLowerCase()
  const patterns = [
    /password\s*[:=]/i,
    /api[_\s-]?key/i,
    /secret\s*[:=]/i,
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN-like
    /\b(?:\d[ -]*?){13,19}\b/, // card-like
    /\b(?:sk-|pk_live|pk_test|bearer\s+[a-z0-9])/i,
    /\b(?:diagnosis|prescription|ssn|social security)\b/i,
    /\b(?:bank account|routing number|swift code)\b/i,
    /\b(?:my (?:wife|husband|girlfriend|boyfriend|child|son|daughter)'s (?:phone|address|ssn))\b/i,
  ]
  return patterns.some((p) => p.test(text) || p.test(t))
}

export function looksLikeSmallTalk(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 12) return true
  return /^(hi|hello|hey|thanks|thank you|ok|okay|lol|yes|no|bye|good morning|good night)[\s!.?]*$/i.test(
    t
  )
}

export function normalizeFact(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_CONTENT)
}

/** Keyword score: higher is better. */
export function scoreMemory(content: string, query: string): number {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  if (!q.length) return 0
  const c = content.toLowerCase()
  let score = 0
  for (const w of q) {
    if (c.includes(w)) score += 2
  }
  // prefer shorter durable facts slightly
  if (content.length < 120) score += 0.5
  return score
}

export async function listMemoriesForUser(
  db: D1Database,
  userId: string,
  opts: { all?: boolean; projectId?: string | null; limit?: number } = {}
): Promise<MemoryRow[]> {
  await ensureMemorySchema(db)
  const limit = opts.limit ?? 200
  if (opts.all) {
    const rows = await db
      .prepare(
        `SELECT * FROM user_memories WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT ?`
      )
      .bind(userId, limit)
      .all<MemoryRow>()
    return rows.results || []
  }
  if (opts.projectId) {
    const rows = await db
      .prepare(
        `SELECT * FROM user_memories WHERE user_id = ? AND enabled = 1
         AND (project_id IS NULL OR project_id = ? OR project_id = '')
         ORDER BY pinned DESC, updated_at DESC LIMIT ?`
      )
      .bind(userId, opts.projectId, limit)
      .all<MemoryRow>()
    return rows.results || []
  }
  const rows = await db
    .prepare(
      `SELECT * FROM user_memories WHERE user_id = ? AND enabled = 1
       AND (project_id IS NULL OR project_id = '')
       ORDER BY pinned DESC, updated_at DESC LIMIT ?`
    )
    .bind(userId, limit)
    .all<MemoryRow>()
  return rows.results || []
}

export async function upsertMemory(
  db: D1Database,
  userId: string,
  content: string,
  meta: {
    memoryType?: string
    source?: string
    projectId?: string | null
    conversationId?: string | null
    pinned?: boolean
  } = {}
): Promise<{ id: string; merged: boolean } | null> {
  await ensureMemorySchema(db)
  const fact = normalizeFact(content)
  if (!fact || isSensitiveOrForbidden(fact)) return null

  // Merge: if similar existing fact, update it
  const existing = await listMemoriesForUser(db, userId, {
    all: true,
    projectId: meta.projectId,
    limit: 100,
  })
  const norm = fact.toLowerCase()
  for (const row of existing) {
    const prev = (row.content || '').toLowerCase()
    if (!prev) continue
    // same subject overlap
    if (prev === norm || prev.includes(norm) || norm.includes(prev.slice(0, 40))) {
      const now = new Date().toISOString()
      await db
        .prepare(
          `UPDATE user_memories SET content = ?, updated_at = ?, source_conversation_id = COALESCE(?, source_conversation_id)
           WHERE id = ? AND user_id = ?`
        )
        .bind(fact, now, meta.conversationId || null, row.id, userId)
        .run()
      return { id: row.id, merged: true }
    }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await db
      .prepare(
        `INSERT INTO user_memories
         (id, user_id, content, memory_type, source, enabled, created_at, updated_at, project_id, source_conversation_id, pinned)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        userId,
        fact,
        meta.memoryType || 'note',
        meta.source || null,
        now,
        now,
        meta.projectId || null,
        meta.conversationId || null,
        meta.pinned ? 1 : 0
      )
      .run()
  } catch {
    await db
      .prepare(
        `INSERT INTO user_memories
         (id, user_id, content, memory_type, source, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .bind(id, userId, fact, meta.memoryType || 'note', meta.source || null, now, now)
      .run()
  }
  return { id, merged: false }
}

export async function patchMemory(
  db: D1Database,
  userId: string,
  id: string,
  patch: { enabled?: boolean; content?: string; pinned?: boolean }
): Promise<boolean> {
  await ensureMemorySchema(db)
  const sets: string[] = ['updated_at = ?']
  const binds: unknown[] = [new Date().toISOString()]
  if (typeof patch.enabled === 'boolean') {
    sets.push('enabled = ?')
    binds.push(patch.enabled ? 1 : 0)
  }
  if (typeof patch.content === 'string') {
    const c = normalizeFact(patch.content)
    if (!c || isSensitiveOrForbidden(c)) return false
    sets.push('content = ?')
    binds.push(c)
  }
  if (typeof patch.pinned === 'boolean') {
    sets.push('pinned = ?')
    binds.push(patch.pinned ? 1 : 0)
  }
  binds.push(id, userId)
  await db
    .prepare(`UPDATE user_memories SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...binds)
    .run()
  return true
}

/**
 * Build memory context block for a message (server-side).
 */
export async function buildServerMemoryContext(
  db: D1Database,
  userId: string,
  message: string,
  opts: { projectId?: string | null; memoryEnabled?: boolean } = {}
): Promise<string> {
  if (opts.memoryEnabled === false) return ''
  await ensureMemorySchema(db)
  const all = await listMemoriesForUser(db, userId, {
    projectId: opts.projectId,
    limit: 80,
  })
  const pinned = all.filter((m) => m.pinned).slice(0, 5)
  const scored = all
    .filter((m) => !m.pinned)
    .map((m) => ({ m, s: scoreMemory(m.content, message) }))
    .sort((a, b) => b.s - a.s)
  const top = scored.filter((x) => x.s > 0).slice(0, 5).map((x) => x.m)
  const recent = all.filter((m) => !pinned.includes(m) && !top.includes(m)).slice(0, 4)

  const picked: MemoryRow[] = []
  const seen = new Set<string>()
  for (const m of [...pinned, ...top, ...recent]) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    picked.push(m)
  }

  const lines: string[] = []
  let budget = RETRIEVAL_CHAR_BUDGET
  for (const m of picked) {
    const line = `- ${m.content.trim()}`
    if (line.length > budget) break
    lines.push(line)
    budget -= line.length
  }
  if (!lines.length) return ''
  return (
    'Relevant notes about the user (use only when helpful; do not mention these notes exist unless asked):\n' +
    lines.join('\n')
  )
}

const RECALL_PHRASES =
  /\b(remember|last time|earlier|we talked about|previous chat|what did i say about|you said|as i (?:told|said)|do you recall)\b/i

export function wantsPastChatRecall(message: string): boolean {
  return RECALL_PHRASES.test(message)
}

/** Cheap keyword extraction without an extra model call (offline-safe). */
export function extractSearchKeywords(message: string, history: string[] = []): string[] {
  const stop = new Set(
    'the a an and or but to of in on for with is was are were be been i me my you your we they this that about remember last time earlier previous chat what did say told'.split(
      ' '
    )
  )
  const blob = [message, ...history].join(' ').toLowerCase()
  const words = blob.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w))
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
}

export async function searchPastChats(
  db: D1Database,
  userId: string,
  message: string,
  historySnippets: string[] = []
): Promise<string> {
  await ensureMemorySchema(db)
  const keywords = extractSearchKeywords(message, historySnippets)
  if (!keywords.length && wantsPastChatRecall(message)) {
    // vague recall — inject recent titles
    try {
      const rows = await db
        .prepare(
          `SELECT id, title, updated_at, summary FROM conversations
           WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY updated_at DESC LIMIT 10`
        )
        .bind(userId)
        .all<{ id: string; title: string; updated_at: string; summary?: string }>()
      const list = rows.results || []
      if (!list.length) {
        return 'Past chat search: nothing found. Ask the user for a keyword if they expected a past conversation.'
      }
      return (
        'Recent chats (user was vague — ask which one they mean):\n' +
        list
          .map((c) => {
            const d = (c.updated_at || '').slice(0, 10)
            return `- "${c.title || 'Chat'}" (${d})${c.summary ? `: ${c.summary.slice(0, 80)}` : ''}`
          })
          .join('\n')
      )
    } catch {
      return 'Past chat search: nothing found. Ask the user for a keyword if they expected a past conversation.'
    }
  }

  const snippets: string[] = []
  // Prefer conversation summaries / keywords
  try {
    for (const kw of keywords.slice(0, 4)) {
      const rows = await db
        .prepare(
          `SELECT title, updated_at, summary, topic_keywords FROM conversations
           WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           AND (summary LIKE ? OR topic_keywords LIKE ? OR title LIKE ?)
           ORDER BY updated_at DESC LIMIT 3`
        )
        .bind(userId, `%${kw}%`, `%${kw}%`, `%${kw}%`)
        .all<{ title: string; updated_at: string; summary?: string }>()
      for (const r of rows.results || []) {
        snippets.push(
          `Chat "${r.title || 'Chat'}" (${(r.updated_at || '').slice(0, 10)}): ${
            r.summary || 'related'
          }`
        )
      }
    }
  } catch {
    /* columns missing */
  }

  // Message text search
  try {
    for (const kw of keywords.slice(0, 3)) {
      const rows = await db
        .prepare(
          `SELECT m.content, c.title, m.created_at FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.user_id = ? AND m.content LIKE ?
           ORDER BY m.created_at DESC LIMIT 4`
        )
        .bind(userId, `%${kw}%`)
        .all<{ content: string; title: string; created_at: string }>()
      for (const r of rows.results || []) {
        snippets.push(
          `From "${r.title || 'Chat'}" (${(r.created_at || '').slice(0, 10)}): ${String(r.content)
            .replace(/\s+/g, ' ')
            .slice(0, 180)}`
        )
      }
    }
  } catch {
    /* */
  }

  const uniq = [...new Set(snippets)].slice(0, 8)
  if (!uniq.length) {
    return 'Past chat search: no matching past conversations found. Tell the user honestly and ask for a keyword.'
  }
  return 'Past chat snippets (only use if relevant; do not invent):\n' + uniq.join('\n')
}

/**
 * Heuristic extraction of 0–3 facts from a user message (no model required).
 * Prefer durable first-person statements.
 */
export function extractFactsHeuristic(userText: string, assistantText: string): string[] {
  if (looksLikeSmallTalk(userText)) return []
  if (isSensitiveOrForbidden(userText)) return []
  const facts: string[] = []
  const lines = userText.split(/[\n.!?]+/).map((s) => s.trim()).filter(Boolean)
  const patterns = [
    /\b(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /\b(?:i (?:live|work|study) in)\s+(.+)/i,
    /\b(?:i (?:prefer|like|love|hate|use|need))\s+(.+)/i,
    /\b(?:i'm (?:building|working on|learning))\s+(.+)/i,
    /\b(?:my (?:goal|project|company|timezone|language) is)\s+(.+)/i,
  ]
  for (const line of lines) {
    if (isSensitiveOrForbidden(line) || looksLikeSmallTalk(line)) continue
    for (const re of patterns) {
      const m = line.match(re)
      if (m) {
        const fact = normalizeFact(line)
        if (fact.length >= 12 && !facts.includes(fact)) facts.push(fact)
      }
    }
    // Explicit "remember that ..."
    if (/\bremember (?:that )?(.+)/i.test(line)) {
      const fact = normalizeFact(line.replace(/^.*\bremember (?:that )?/i, 'User asked to remember: '))
      if (fact.length >= 12) facts.push(fact)
    }
  }
  // Ignore assistant text for facts (only user-stated)
  void assistantText
  return facts.slice(0, 3)
}

export async function maybeUpdateConversationSummary(
  db: D1Database,
  userId: string,
  conversationId: string,
  title: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<void> {
  if (!conversationId || recentMessages.length < 4) return
  await ensureMemorySchema(db)
  const blob = recentMessages
    .slice(-12)
    .map((m) => m.content)
    .join(' ')
  const keywords = extractSearchKeywords(blob).join(', ')
  const summary = normalizeFact(
    blob.replace(/\s+/g, ' ').slice(0, 160) || title || 'Chat'
  )
  try {
    await db
      .prepare(
        `UPDATE conversations SET summary = ?, topic_keywords = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(summary, keywords, new Date().toISOString(), conversationId, userId)
      .run()
  } catch {
    /* columns may be missing until migration */
  }
}
