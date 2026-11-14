/**
 * Archived-chat ids (same localStorage key the app already used).
 * One tiny store shared by the Sidebar, the /archived page and Settings so
 * archiving in one place shows up everywhere immediately.
 */
import { useEffect, useState } from 'react'

export const ARCHIVE_KEY = 'nyven_archived_chats_v1'
const CHANGE_EVENT = 'nyven-archive-changed'

export function loadArchivedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function archiveChat(id: string) {
  const next = loadArchivedIds()
  next.add(id)
  persist(next)
}

export function unarchiveChat(id: string) {
  const next = loadArchivedIds()
  next.delete(id)
  persist(next)
}

/** Live Set of archived ids; updates on any change in this tab or another. */
export function useArchivedIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => loadArchivedIds())
  useEffect(() => {
    const sync = () => setIds(loadArchivedIds())
    const onStorage = (e: StorageEvent) => {
      if (e.key === ARCHIVE_KEY || e.key === null) sync()
    }
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', onStorage)
    sync()
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return ids
}
