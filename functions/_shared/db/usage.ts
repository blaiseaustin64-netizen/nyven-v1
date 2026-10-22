/**
 * Server-side usage accounting (D1) — fail closed when DB is unavailable.
 * Production must not bypass quotas if D1 is missing or errors.
 */

import type { D1Database } from './types'
import {
  CHAT_BURST_PER_MINUTE,
  dayKeyUtc,
  limitsFor,
  parseProviderBudgetEnv,
  type UsageLimits,
} from '../limits'

export type UsageSnapshot = {
  subjectType: 'user' | 'guest'
  subjectId: string
  dayKey: string
  chatCount: number
  voiceSeconds: number
  limits: UsageLimits
  chatRemaining: number
  voiceSecondsRemaining: number
  resetsAt: string
}

export type QuotaDeny = {
  ok: false
  code: string
  message: string
  snapshot: UsageSnapshot
  httpStatus: number
}

function rowId(subjectType: string, subjectId: string, dayKey: string): string {
  return `${subjectType}:${subjectId}:${dayKey}`
}

function endOfUtcDayIso(dayKey: string): string {
  return `${dayKey}T23:59:59.999Z`
}

function emptySnapshot(
  subjectType: 'user' | 'guest',
  subjectId: string,
  authenticated: boolean
): UsageSnapshot {
  const limits = limitsFor(authenticated)
  const dayKey = dayKeyUtc()
  return {
    subjectType,
    subjectId,
    dayKey,
    chatCount: 0,
    voiceSeconds: 0,
    limits,
    chatRemaining: limits.chatPerDay,
    voiceSecondsRemaining: limits.voiceSecondsPerDay,
    resetsAt: endOfUtcDayIso(dayKey),
  }
}

/** Hard requirement: D1 must be bound for any quota-sensitive path. */
export function requireDb(
  db: D1Database | undefined
): { ok: true; db: D1Database } | { ok: false; code: string; message: string; httpStatus: number } {
  if (!db) {
    return {
      ok: false,
      code: 'QUOTA_STORE_UNAVAILABLE',
      message:
        'NYVEN usage controls are unavailable: the D1 binding (DB) is not attached to this Pages Function. Bind nyven-db as DB in Cloudflare Pages → Settings → Functions, then redeploy.',
      httpStatus: 503,
    }
  }
  return { ok: true, db }
}

export async function getUsageSnapshot(
  db: D1Database | undefined,
  subjectType: 'user' | 'guest',
  subjectId: string,
  authenticated: boolean
): Promise<UsageSnapshot> {
  const base = emptySnapshot(subjectType, subjectId, authenticated)
  if (!db) return base

  try {
    const row = await db
      .prepare(
        `SELECT chat_count, voice_seconds FROM usage_daily
         WHERE subject_type = ? AND subject_id = ? AND day_key = ?`
      )
      .bind(subjectType, subjectId, base.dayKey)
      .first<{ chat_count: number; voice_seconds: number }>()

    const chatCount = row?.chat_count ?? 0
    const voiceSeconds = row?.voice_seconds ?? 0
    return {
      ...base,
      chatCount,
      voiceSeconds,
      chatRemaining: Math.max(0, base.limits.chatPerDay - chatCount),
      voiceSecondsRemaining: Math.max(0, base.limits.voiceSecondsPerDay - voiceSeconds),
    }
  } catch {
    // Surface as empty remaining so callers that ignore requireDb still deny
    return {
      ...base,
      chatCount: base.limits.chatPerDay,
      voiceSeconds: base.limits.voiceSecondsPerDay,
      chatRemaining: 0,
      voiceSecondsRemaining: 0,
    }
  }
}

/**
 * Atomically reserve one chat message. Fails closed without D1.
 */
export async function consumeChatMessage(
  db: D1Database | undefined,
  subjectType: 'user' | 'guest',
  subjectId: string,
  authenticated: boolean
): Promise<{ ok: true; snapshot: UsageSnapshot } | QuotaDeny> {
  const limits = limitsFor(authenticated)
  const dayKey = dayKeyUtc()
  const snapshot = await getUsageSnapshot(db, subjectType, subjectId, authenticated)

  const missing = requireDb(db)
  if (!missing.ok) {
    return {
      ok: false,
      code: missing.code,
      message: missing.message,
      snapshot,
      httpStatus: missing.httpStatus,
    }
  }
  const database = missing.db

  if (snapshot.chatCount >= limits.chatPerDay) {
    return {
      ok: false,
      code: 'CHAT_LIMIT_REACHED',
      message: authenticated
        ? `You've reached today's chat limit (${limits.chatPerDay} messages). It resets at ${snapshot.resetsAt} (UTC).`
        : `Guest limit reached (${limits.chatPerDay} messages/day). Sign in for a higher allowance, or try again after ${snapshot.resetsAt} (UTC).`,
      snapshot,
      httpStatus: 429,
    }
  }

  const id = rowId(subjectType, subjectId, dayKey)
  const now = new Date().toISOString()

  try {
    // Try insert first (new day/subject)
    try {
      await database
        .prepare(
          `INSERT INTO usage_daily (id, subject_type, subject_id, day_key, chat_count, voice_seconds, updated_at)
           VALUES (?, ?, ?, ?, 1, 0, ?)`
        )
        .bind(id, subjectType, subjectId, dayKey, now)
        .run()
    } catch {
      // Row exists — conditional increment
      const result = await database
        .prepare(
          `UPDATE usage_daily
           SET chat_count = chat_count + 1, updated_at = ?
           WHERE subject_type = ? AND subject_id = ? AND day_key = ? AND chat_count < ?`
        )
        .bind(now, subjectType, subjectId, dayKey, limits.chatPerDay)
        .run()

      const changes = result.meta?.changes ?? 0
      if (changes < 1) {
        const after = await getUsageSnapshot(database, subjectType, subjectId, authenticated)
        return {
          ok: false,
          code: 'CHAT_LIMIT_REACHED',
          message: authenticated
            ? `You've reached today's chat limit (${limits.chatPerDay} messages).`
            : `Guest limit reached (${limits.chatPerDay} messages/day).`,
          snapshot: after,
          httpStatus: 429,
        }
      }
    }

    const after = await getUsageSnapshot(database, subjectType, subjectId, authenticated)
    return { ok: true, snapshot: after }
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_ERROR',
      message: 'NYVEN usage controls hit a database error. Confirm D1 tables exist (usage_daily, rate_buckets, provider_budget) on the bound nyven-db database.',
      snapshot,
      httpStatus: 503,
    }
  }
}

/**
 * Reserve voice seconds (min of request, session cap, remaining). Fail closed without D1.
 */
export async function consumeVoiceSeconds(
  db: D1Database | undefined,
  subjectType: 'user' | 'guest',
  subjectId: string,
  authenticated: boolean,
  requestedSeconds: number
): Promise<
  | { ok: true; grantedSeconds: number; snapshot: UsageSnapshot }
  | (QuotaDeny & { grantedSeconds?: number })
> {
  const limits = limitsFor(authenticated)
  const snapshot = await getUsageSnapshot(db, subjectType, subjectId, authenticated)

  const missing = requireDb(db)
  if (!missing.ok) {
    return {
      ok: false,
      code: missing.code,
      message: missing.message,
      snapshot,
      httpStatus: missing.httpStatus,
    }
  }
  const database = missing.db

  const remaining = snapshot.voiceSecondsRemaining
  const sessionCap = limits.maxVoiceSessionSeconds
  const want = Math.max(0, Math.min(Math.ceil(requestedSeconds), sessionCap, remaining))

  if (remaining <= 0 || want <= 0) {
    return {
      ok: false,
      code: 'VOICE_LIMIT_REACHED',
      message: authenticated
        ? `Voice allowance used up for today (${limits.voiceSecondsPerDay}s). Resets ${snapshot.resetsAt} (UTC).`
        : `Guest voice limit reached (1 minute/day). Sign in for more, or wait until ${snapshot.resetsAt} (UTC).`,
      snapshot,
      httpStatus: 429,
    }
  }

  if (requestedSeconds > sessionCap) {
    return {
      ok: false,
      code: 'VOICE_SESSION_CAP',
      message: `Voice sessions are limited to ${sessionCap / 60} minutes.`,
      snapshot,
      httpStatus: 400,
    }
  }

  const dayKey = snapshot.dayKey
  const id = rowId(subjectType, subjectId, dayKey)
  const now = new Date().toISOString()

  try {
    try {
      await database
        .prepare(
          `INSERT INTO usage_daily (id, subject_type, subject_id, day_key, chat_count, voice_seconds, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(id, subjectType, subjectId, dayKey, want, now)
        .run()
    } catch {
      // Conditional increment: only if remaining capacity covers want
      const result = await database
        .prepare(
          `UPDATE usage_daily
           SET voice_seconds = voice_seconds + ?, updated_at = ?
           WHERE subject_type = ? AND subject_id = ? AND day_key = ?
             AND voice_seconds + ? <= ?`
        )
        .bind(want, now, subjectType, subjectId, dayKey, want, limits.voiceSecondsPerDay)
        .run()

      const changes = result.meta?.changes ?? 0
      if (changes < 1) {
        const after = await getUsageSnapshot(database, subjectType, subjectId, authenticated)
        return {
          ok: false,
          code: 'VOICE_LIMIT_REACHED',
          message: 'No voice time remaining for today.',
          snapshot: after,
          httpStatus: 429,
        }
      }
    }

    const after = await getUsageSnapshot(database, subjectType, subjectId, authenticated)
    return { ok: true, grantedSeconds: want, snapshot: after }
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_ERROR',
      message: 'NYVEN usage controls hit a database error. Confirm D1 tables exist (usage_daily, rate_buckets, provider_budget) on the bound nyven-db database.',
      snapshot,
      httpStatus: 503,
    }
  }
}

/** Burst limit — fail closed without D1 */
export async function checkBurst(
  db: D1Database | undefined,
  bucketKey: string,
  max: number = CHAT_BURST_PER_MINUTE,
  windowMs = 60_000
): Promise<{ ok: true } | { ok: false; code: string; message: string; httpStatus: number }> {
  const missing = requireDb(db)
  if (!missing.ok) {
    return {
      ok: false,
      code: missing.code,
      message: missing.message,
      httpStatus: missing.httpStatus,
    }
  }
  const database = missing.db
  const now = Date.now()

  try {
    const row = await database
      .prepare(`SELECT count, window_start_ms FROM rate_buckets WHERE bucket_key = ?`)
      .bind(bucketKey)
      .first<{ count: number; window_start_ms: number }>()

    if (!row || now - row.window_start_ms > windowMs) {
      await database
        .prepare(
          `INSERT INTO rate_buckets (id, bucket_key, count, window_start_ms, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET
             count = 1,
             window_start_ms = excluded.window_start_ms,
             updated_at = excluded.updated_at`
        )
        .bind(bucketKey, bucketKey, now, new Date().toISOString())
        .run()
      return { ok: true }
    }

    if (row.count >= max) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment and try again.',
        httpStatus: 429,
      }
    }

    await database
      .prepare(
        `UPDATE rate_buckets SET count = count + 1, updated_at = ? WHERE bucket_key = ?`
      )
      .bind(new Date().toISOString(), bucketKey)
      .run()
    return { ok: true }
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_ERROR',
      message: 'NYVEN usage controls hit a database error. Confirm D1 tables exist (usage_daily, rate_buckets, provider_budget) on the bound nyven-db database.',
      httpStatus: 503,
    }
  }
}

export async function consumeProviderRequest(
  db: D1Database | undefined,
  provider: string,
  env: Parameters<typeof parseProviderBudgetEnv>[0]
): Promise<{ ok: true } | { ok: false; code: string; message: string; httpStatus: number }> {
  const missing = requireDb(db)
  if (!missing.ok) {
    return {
      ok: false,
      code: missing.code,
      message: missing.message,
      httpStatus: missing.httpStatus,
    }
  }
  const database = missing.db
  const budgets = parseProviderBudgetEnv(env)
  const max = budgets[provider] ?? 1000
  const dayKey = dayKeyUtc()
  const now = new Date().toISOString()

  try {
    const row = await database
      .prepare(`SELECT day_key, request_count FROM provider_budget WHERE provider = ?`)
      .bind(provider)
      .first<{ day_key: string; request_count: number }>()

    let count = 0
    if (row && row.day_key === dayKey) {
      count = row.request_count
    }

    if (count >= max) {
      return {
        ok: false,
        code: 'PROVIDER_BUDGET_EXHAUSTED',
        message:
          "NYVEN's AI service is temporarily at capacity. Please try again later.",
        httpStatus: 503,
      }
    }

    if (!row || row.day_key !== dayKey) {
      await database
        .prepare(
          `INSERT INTO provider_budget (provider, day_key, request_count, updated_at)
           VALUES (?, ?, 1, ?)
           ON CONFLICT(provider) DO UPDATE SET
             day_key = excluded.day_key,
             request_count = 1,
             updated_at = excluded.updated_at`
        )
        .bind(provider, dayKey, now)
        .run()
    } else {
      const result = await database
        .prepare(
          `UPDATE provider_budget
           SET request_count = request_count + 1, updated_at = ?
           WHERE provider = ? AND day_key = ? AND request_count < ?`
        )
        .bind(now, provider, dayKey, max)
        .run()
      if ((result.meta?.changes ?? 0) < 1) {
        return {
          ok: false,
          code: 'PROVIDER_BUDGET_EXHAUSTED',
          message:
            "NYVEN's AI service is temporarily at capacity. Please try again later.",
          httpStatus: 503,
        }
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      code: 'QUOTA_STORE_ERROR',
      message: 'NYVEN usage controls hit a database error. Confirm D1 tables exist (usage_daily, rate_buckets, provider_budget) on the bound nyven-db database.',
      httpStatus: 503,
    }
  }
}
