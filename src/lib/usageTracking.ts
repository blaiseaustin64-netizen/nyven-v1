/**
 * Client-side usage hints only. Authoritative limits are enforced server-side on D1.
 */

export async function trackUsageEvent(
  _userId: string | null,
  _eventType: string,
  _meta?: Record<string, unknown>
): Promise<void> {
  /* Server-side accounting only */
}

export async function getLocalUsageHint(): Promise<null> {
  return null
}
