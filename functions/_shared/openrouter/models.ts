/**
 * Centralized OpenRouter model routing for NYVEN Projects.
 * Secrets stay server-side (OPENROUTER_API_KEY). Never import this from frontend.
 */

export const PROJECT_PRIMARY_MODEL = 'nvidia/nemotron-3-ultra:free'
export const PROJECT_FALLBACK_MODEL = 'nvidia/nemotron-3.5-super-vl:free'
export const PROJECT_MODEL_CHAIN = [PROJECT_PRIMARY_MODEL, PROJECT_FALLBACK_MODEL] as const

export function isRetryableProviderFailure(status: number, bodyText = ''): boolean {
  const t = bodyText.toLowerCase()
  if (status === 429 || status === 502 || status === 503 || status === 504 || status === 404 || status === 408) return true
  if (
    t.includes('rate') ||
    t.includes('quota') ||
    t.includes('capacity') ||
    t.includes('overloaded') ||
    t.includes('unavailable') ||
    t.includes('timeout') ||
    t.includes('temporar') ||
    t.includes('provider') ||
    t.includes('no endpoints') ||
    t.includes('model is not available')
  ) {
    return true
  }
  return false
}

export const USER_FACING_AI_UNAVAILABLE =
  'NYVEN is having trouble reaching its AI service right now. Please try again in a moment.'
