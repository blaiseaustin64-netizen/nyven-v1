/** Client API for NYVEN AI Projects (D1-backed). Isolated from builder projectStore. */

export type AiProject = {
  id: string
  slug: string
  name: string
  title: string
  description: string
  instructions: string
  status: string
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  chatCount?: number
  fileCount?: number
  taskCount?: number
}

export type ProjectChat = {
  id: string
  title: string
  pinned: boolean
  messageCount: number
  updatedAt: string
  createdAt: string
}

export type ProjectTask = {
  id: string
  projectId: string
  title: string
  description: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
}

export type ProjectActivity = {
  id: string
  projectId: string
  eventType: string
  metadata: Record<string, unknown>
  createdAt: string
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: {} as T }
  }
}

export async function fetchProjects(): Promise<AiProject[]> {
  const r = await jsonFetch<{ success?: boolean; projects?: AiProject[] }>('/api/projects')
  return r.ok && Array.isArray(r.data.projects) ? r.data.projects : []
}

export async function createProject(input: {
  name: string
  description?: string
  instructions?: string
}): Promise<{ project: AiProject | null; error?: string }> {
  const r = await jsonFetch<{ success?: boolean; project?: AiProject; error?: string; code?: string }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (r.status === 401 || r.data?.code === 'UNAUTHORIZED') {
    return { project: null, error: 'Please sign in to create a project.' }
  }
  if ((r.ok || r.status === 201) && r.data?.project) {
    return { project: r.data.project }
  }
  return {
    project: null,
    error: r.data?.error || (r.status === 0 ? 'Network error. Check your connection and try again.' : 'Could not create project. Please try again.'),
  }
}): Promise<AiProject | null> {
  const r = await jsonFetch<{ success?: boolean; project?: AiProject }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return r.ok && r.data.project ? r.data.project : null
}

export async function fetchProject(id: string): Promise<{
  project: AiProject
  chats: ProjectChat[]
  tasks: ProjectTask[]
  activity: ProjectActivity[]
} | null> {
  const r = await jsonFetch<{
    success?: boolean
    project?: AiProject
    chats?: ProjectChat[]
    tasks?: ProjectTask[]
    activity?: ProjectActivity[]
  }>(`/api/projects/${id}`)
  if (!r.ok || !r.data.project) return null
  return {
    project: r.data.project,
    chats: r.data.chats || [],
    tasks: r.data.tasks || [],
    activity: r.data.activity || [],
  }
}

export async function updateProject(
  id: string,
  patch: Partial<{ name: string; description: string; instructions: string; status: string; archive: boolean }>
): Promise<AiProject | null> {
  const r = await jsonFetch<{ success?: boolean; project?: AiProject }>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return r.ok && r.data.project ? r.data.project : null
}

export async function deleteProject(id: string): Promise<boolean> {
  const r = await jsonFetch<{ success?: boolean }>(`/api/projects/${id}`, { method: 'DELETE' })
  return r.ok
}

export async function createProjectChat(projectId: string, title?: string): Promise<ProjectChat | null> {
  const r = await jsonFetch<{ success?: boolean; chat?: ProjectChat }>(`/api/projects/${projectId}/chats`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
  return r.ok && r.data.chat ? r.data.chat : null
}

export async function fetchProjectChats(projectId: string): Promise<ProjectChat[]> {
  const r = await jsonFetch<{ success?: boolean; chats?: ProjectChat[] }>(`/api/projects/${projectId}/chats`)
  return r.ok && Array.isArray(r.data.chats) ? r.data.chats : []
}

export async function saveTask(
  projectId: string,
  task: { id?: string; title: string; description?: string; status?: string; priority?: string }
): Promise<ProjectTask | null> {
  const r = await jsonFetch<{ success?: boolean; task?: ProjectTask }>(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(task),
  })
  return r.ok && r.data.task ? r.data.task : null
}

export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}

export function activityLabel(eventType: string): string {
  const map: Record<string, string> = {
    project_created: 'Project created',
    project_renamed: 'Project renamed',
    instructions_updated: 'Instructions updated',
    chat_created: 'Chat created',
    task_created: 'Task created',
    task_completed: 'Task completed',
    project_archived: 'Project archived',
    file_uploaded: 'File uploaded',
  }
  return map[eventType] || eventType.replace(/_/g, ' ')
}
