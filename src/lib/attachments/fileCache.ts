/**
 * IndexedDB cache for original attachment blobs (per-device, per-user).
 * DB: nyven-files. Cap ~100MB, oldest-first eviction. Cleared on sign-out.
 */

const DB_NAME = 'nyven-files'
const STORE = 'blobs'
const MAX_BYTES = 100 * 1024 * 1024

type Meta = {
  id: string
  name: string
  mime: string
  size: number
  userId: string
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('userId', 'userId', { unique: false })
        os.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheAttachmentBlob(
  id: string,
  blob: Blob,
  meta: { name: string; mime: string; userId: string }
): Promise<void> {
  if (!meta.userId) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({
        id,
        name: meta.name,
        mime: meta.mime,
        size: blob.size,
        userId: meta.userId,
        createdAt: Date.now(),
        blob,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await evictIfNeeded(meta.userId)
  } catch {
    /* ignore quota */
  }
}

export async function getCachedAttachment(
  id: string,
  userId: string
): Promise<{ blob: Blob; name: string; mime: string } | null> {
  try {
    const db = await openDb()
    const row = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (!row || row.userId !== userId || !row.blob) return null
    return { blob: row.blob as Blob, name: row.name, mime: row.mime }
  } catch {
    return null
  }
}

async function evictIfNeeded(userId: string): Promise<void> {
  const db = await openDb()
  const all = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  const mine = all.filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt)
  let total = mine.reduce((s, r) => s + (r.size || 0), 0)
  if (total <= MAX_BYTES) return
  const tx = db.transaction(STORE, 'readwrite')
  const os = tx.objectStore(STORE)
  for (const r of mine) {
    if (total <= MAX_BYTES) break
    os.delete(r.id)
    total -= r.size || 0
  }
}

export async function clearFileCacheForUser(userId: string): Promise<void> {
  try {
    const db = await openDb()
    const all = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction(STORE, 'readwrite')
    const os = tx.objectStore(STORE)
    for (const r of all) {
      if (r.userId === userId) os.delete(r.id)
    }
  } catch {
    /* */
  }
}
