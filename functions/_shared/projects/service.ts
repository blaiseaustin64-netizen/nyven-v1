/**
 * AI Projects service — D1-backed, ownership enforced on every call.
 * Isolated from builder/forge sessionStorage projects.
 */
import type { D1Database } from '../db/types'

export type ProjectRow = {
  id: string
  user_id: string
  slug: string
  title: string
  description?: string
  instructions?: string
  status?: string
  data_json?: string
  metadata_json?: string
  archived_at?: string | null
  created_at: string
  updated_at: string
}

export type TaskRow = {
  id: string
  project_id: string
  user_id: string
  title: string
  description: string
  status: string
  priority: string
  created_at: string
  updated_at: string
}

export type ActivityRow = {
  id: string
  project_id: string
  user_id: string
  event_type: string
  metadata_json: string
  created_at: string
}

function nowIso() {
  return new Date().toISOString()
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'project'
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

export function toPublicProject(row: ProjectRow, extras?: { chatCount?: number; fileCount?: number; taskCount?: number }) {
  let metadata: Record<string, unknown> = {}
  try { metadata = JSON.parse(row.metadata_json || '{}') } catch { /* */ }
  let data: Record<string, unknown> = {}
  try {
    const raw = (row as { data_json?: string }).data_json
    if (raw) data = JSON.parse(raw)
  } catch { /* */ }
  const description =
    (row.description && String(row.description)) ||
    (typeof data.description === 'string' ? data.description : '') ||
    ''
  const instructions =
    (row.instructions && String(row.instructions)) ||
    (typeof data.instructions === 'string' ? data.instructions : '') ||
    ''
  const status =
    (row.status && String(row.status)) ||
    (typeof data.status === 'string' ? data.status : 'active')
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    title: row.title,
    description,
    instructions,
    status,
    archivedAt: row.archived_at,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chatCount: extras?.chatCount ?? 0,
    fileCount: extras?.fileCount ?? 0,
    taskCount: extras?.taskCount ?? 0,
  }
}

export async function assertProjectOwner(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<ProjectRow | null> {
  const row = await db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .bind(projectId, userId)
    .first<ProjectRow>()
  return row || null
}

export async function recordActivity(
  db: D1Database,
  projectId: string,
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO project_activity (id, project_id, user_id, event_type, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, userId, eventType, JSON.stringify(metadata), nowIso())
    .run()
}

export async function listProjectsForUser(db: D1Database, userId: string, includeArchived = false) {
  const sql = includeArchived
    ? `SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM projects WHERE user_id = ? AND (archived_at IS NULL OR archived_at = '') ORDER BY updated_at DESC`
  const rows = await db.prepare(sql).bind(userId).all<ProjectRow>()
  const results = rows.results || []
  const out = []
  for (const row of results) {
    let chatCount = 0
    let fileCount = 0
    let taskCount = 0
    try {
      const c = await db.prepare(`SELECT COUNT(*) as n FROM conversations WHERE user_id = ? AND project_id = ? AND (deleted_at IS NULL OR deleted_at = '')`).bind(userId, row.id).first<{ n: number }>()
      chatCount = Number(c?.n || 0)
    } catch { /* */ }
    try {
      const f = await db.prepare(`SELECT COUNT(*) as n FROM project_files WHERE project_id = ?`).bind(row.id).first<{ n: number }>()
      fileCount = Number(f?.n || 0)
    } catch { /* */ }
    try {
      const tk = await db.prepare(`SELECT COUNT(*) as n FROM project_tasks WHERE project_id = ?`).bind(row.id).first<{ n: number }>()
      taskCount = Number(tk?.n || 0)
    } catch { /* */ }
    out.push(toPublicProject(row, { chatCount, fileCount, taskCount }))
  }
  return out
}

export async function createProject(
  db: D1Database,
  userId: string,
  input: { name: string; description?: string; instructions?: string }
) {
  const id = crypto.randomUUID()
  const now = nowIso()
  const title = (input.name || 'Untitled project').trim().slice(0, 120) || 'Untitled project'
  const slug = slugify(title)
  const description = (input.description || '').trim().slice(0, 2000)
  const instructions = (input.instructions || '').trim().slice(0, 8000)
  const dataJson = JSON.stringify({ description, instructions, status: 'active' })

  // Always use base 0005 columns first (works before 0006 is applied).
  let inserted = false
  let lastErr: unknown = null
  try {
    await db
      .prepare(
        `INSERT INTO projects (id, user_id, slug, title, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, slug, title, dataJson, now, now)
      .run()
    inserted = true
  } catch (e) {
    lastErr = e
  }

  // Enrich with 0006 columns when available (best-effort).
  if (inserted) {
    try {
      await db
        .prepare(
          `UPDATE projects SET description = ?, instructions = ?, status = 'active', metadata_json = '{}'
           WHERE id = ? AND user_id = ?`
        )
        .bind(description, instructions, id, userId)
        .run()
    } catch {
      /* columns may not exist until migration 0006 */
    }
  } else {
    // Retry once with a unique slug if collision
    const slug2 = slugify(title + '-' + Date.now().toString(36))
    try {
      await db
        .prepare(
          `INSERT INTO projects (id, user_id, slug, title, data_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, userId, slug2, title, dataJson, now, now)
        .run()
      inserted = true
    } catch (e) {
      lastErr = e
      console.error('createProject failed', e instanceof Error ? e.message : e)
      return null
    }
  }

  try { await recordActivity(db, id, userId, 'project_created', { name: title }) } catch { /* */ }
  const row = await assertProjectOwner(db, id, userId)
  if (!row) {
    console.error('createProject: row missing after insert', lastErr instanceof Error ? lastErr.message : '')
    // Synthesize public shape so client still navigates
    return {
      id,
      slug,
      name: title,
      title,
      description,
      instructions,
      status: 'active',
      archivedAt: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      chatCount: 0,
      fileCount: 0,
      taskCount: 0,
    }
  }
  // Merge description/instructions from data_json if columns empty
  const pub = toPublicProject(row)
  if (!pub.description && description) pub.description = description
  if (!pub.instructions && instructions) pub.instructions = instructions
  return pub
}

export async function updateProject(
  db: D1Database,
  userId: string,
  projectId: string,
  patch: {
    name?: string
    description?: string
    instructions?: string
    status?: string
    archive?: boolean
    metadata?: Record<string, unknown>
  }
) {
  const existing = await assertProjectOwner(db, projectId, userId)
  if (!existing) return null
  const now = nowIso()
  const sets: string[] = ['updated_at = ?']
  const binds: unknown[] = [now]
  if (typeof patch.name === 'string') {
    sets.push('title = ?')
    binds.push(patch.name.trim().slice(0, 120) || existing.title)
  }
  if (typeof patch.description === 'string') {
    sets.push('description = ?')
    binds.push(patch.description.trim().slice(0, 2000))
  }
  if (typeof patch.instructions === 'string') {
    sets.push('instructions = ?')
    binds.push(patch.instructions.trim().slice(0, 8000))
  }
  if (typeof patch.status === 'string') {
    sets.push('status = ?')
    binds.push(patch.status.slice(0, 40))
  }
  if (patch.archive === true) {
    sets.push('archived_at = ?')
    binds.push(now)
  }
  if (patch.archive === false) {
    sets.push('archived_at = NULL')
  }
  if (patch.metadata) {
    sets.push('metadata_json = ?')
    binds.push(JSON.stringify(patch.metadata))
  }
  binds.push(projectId, userId)
  await db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds).run()
  try {
    if (typeof patch.name === 'string') await recordActivity(db, projectId, userId, 'project_renamed', { name: patch.name })
    if (typeof patch.instructions === 'string') await recordActivity(db, projectId, userId, 'instructions_updated', {})
    if (patch.archive === true) await recordActivity(db, projectId, userId, 'project_archived', {})
  } catch { /* */ }
  const row = await assertProjectOwner(db, projectId, userId)
  return row ? toPublicProject(row) : null
}

export async function deleteProject(db: D1Database, userId: string, projectId: string) {
  const existing = await assertProjectOwner(db, projectId, userId)
  if (!existing) return false
  try {
    await db.prepare(`UPDATE conversations SET project_id = NULL WHERE user_id = ? AND project_id = ?`).bind(userId, projectId).run()
  } catch { /* */ }
  try { await db.prepare(`DELETE FROM project_tasks WHERE project_id = ? AND user_id = ?`).bind(projectId, userId).run() } catch { /* */ }
  try { await db.prepare(`DELETE FROM project_activity WHERE project_id = ? AND user_id = ?`).bind(projectId, userId).run() } catch { /* */ }
  try { await db.prepare(`DELETE FROM project_files WHERE project_id = ? AND user_id = ?`).bind(projectId, userId).run() } catch { /* */ }
  await db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).bind(projectId, userId).run()
  return true
}

export async function listTasks(db: D1Database, userId: string, projectId: string) {
  if (!(await assertProjectOwner(db, projectId, userId))) return null
  try {
    const rows = await db
      .prepare(`SELECT * FROM project_tasks WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC`)
      .bind(projectId, userId)
      .all<TaskRow>()
    return (rows.results || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  } catch {
    return []
  }
}

export async function upsertTask(
  db: D1Database,
  userId: string,
  projectId: string,
  input: { id?: string; title: string; description?: string; status?: string; priority?: string }
) {
  if (!(await assertProjectOwner(db, projectId, userId))) return null
  const now = nowIso()
  const id = input.id || crypto.randomUUID()
  const title = input.title.trim().slice(0, 200)
  if (!title) return null
  const status = (input.status || 'todo').slice(0, 20)
  const priority = (input.priority || 'medium').slice(0, 20)
  const description = (input.description || '').trim().slice(0, 2000)
  const existing = await db.prepare(`SELECT id FROM project_tasks WHERE id = ? AND user_id = ?`).bind(id, userId).first()
  if (existing) {
    await db
      .prepare(
        `UPDATE project_tasks SET title = ?, description = ?, status = ?, priority = ?, updated_at = ?
         WHERE id = ? AND project_id = ? AND user_id = ?`
      )
      .bind(title, description, status, priority, now, id, projectId, userId)
      .run()
    if (status === 'done') await recordActivity(db, projectId, userId, 'task_completed', { taskId: id, title })
  } else {
    await db
      .prepare(
        `INSERT INTO project_tasks (id, project_id, user_id, title, description, status, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, projectId, userId, title, description, status, priority, now, now)
      .run()
    await recordActivity(db, projectId, userId, 'task_created', { taskId: id, title })
  }
  return { id, projectId, title, description, status, priority, createdAt: now, updatedAt: now }
}

export async function listActivity(db: D1Database, userId: string, projectId: string, limit = 40) {
  if (!(await assertProjectOwner(db, projectId, userId))) return null
  try {
    const rows = await db
      .prepare(
        `SELECT * FROM project_activity WHERE project_id = ? AND user_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .bind(projectId, userId, limit)
      .all<ActivityRow>()
    return (rows.results || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      eventType: r.event_type,
      metadata: (() => { try { return JSON.parse(r.metadata_json || '{}') } catch { return {} } })(),
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

export async function listProjectChats(db: D1Database, userId: string, projectId: string) {
  if (!(await assertProjectOwner(db, projectId, userId))) return null
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, pinned, updated_at, created_at,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
         FROM conversations c
         WHERE user_id = ? AND project_id = ? AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY updated_at DESC`
      )
      .bind(userId, projectId)
      .all()
    return (rows.results || []).map((r: any) => ({
      id: r.id,
      title: r.title || 'Chat',
      pinned: !!r.pinned,
      messageCount: Number(r.message_count || 0),
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

export async function createProjectChat(
  db: D1Database,
  userId: string,
  projectId: string,
  title?: string
) {
  if (!(await assertProjectOwner(db, projectId, userId))) return null
  const id = crypto.randomUUID()
  const now = nowIso()
  const t = (title || 'New chat').trim().slice(0, 120) || 'New chat'
  await db
    .prepare(
      `INSERT INTO conversations (id, user_id, title, pinned, project_id, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    )
    .bind(id, userId, t, projectId, now, now)
    .run()
  try { await recordActivity(db, projectId, userId, 'chat_created', { conversationId: id, title: t }) } catch { /* */ }
  await db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?`).bind(now, projectId, userId).run()
  return { id, title: t, pinned: false, messageCount: 0, updatedAt: now, createdAt: now }
}

export async function buildProjectContextBlock(
  db: D1Database,
  userId: string,
  projectId: string
): Promise<string | null> {
  const project = await assertProjectOwner(db, projectId, userId)
  if (!project) return null
  const tasks = await listTasks(db, userId, projectId)
  const openTasks = (tasks || []).filter((tk) => tk.status !== 'done').slice(0, 12)
  const doneTasks = (tasks || []).filter((tk) => tk.status === 'done').slice(0, 6)
  const lines = [
    '[NYVEN PROJECT CONTEXT]',
    `Project: ${project.title}`,
    project.description ? `Description: ${project.description}` : null,
    `Status: ${project.status}`,
    project.instructions
      ? `Project instructions (follow these for this workspace):\n${project.instructions}`
      : null,
    openTasks.length
      ? `Open tasks:\n${openTasks.map((tk) => `- [${tk.status}] ${tk.title}`).join('\n')}`
      : null,
    doneTasks.length
      ? `Recently completed:\n${doneTasks.map((tk) => `- ${tk.title}`).join('\n')}`
      : null,
    'Behave as a professional project partner for this workspace. Prefer organized, decision-aware answers. Do not invent completed work.',
    '[/NYVEN PROJECT CONTEXT]',
  ].filter(Boolean)
  return lines.join('\n')
}
