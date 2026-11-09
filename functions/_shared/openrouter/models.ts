/**
 * Centralized project AI model config (server-side only).
 * Never expose these IDs or provider names in user-facing UI.
 */

/** Primary reasoning model (NVIDIA direct when NVIDIA_API_KEY is set). */
export const PROJECT_PRIMARY_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b'

/** OpenRouter primary when NVIDIA direct is unavailable. */
export const PROJECT_PRIMARY_MODEL_OPENROUTER = 'nvidia/nemotron-3-ultra:free'

/** Vision / multimodal fallback (OpenRouter). */
export const PROJECT_VISION_FALLBACK_MODEL = 'nvidia/nemotron-3.5-super-vl:free'

export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

export function isRetryableProviderFailure(status: number, bodyText = ''): boolean {
  const t = bodyText.toLowerCase()
  if (status === 429 || status === 502 || status === 503 || status === 504 || status === 404 || status === 408) {
    return true
  }
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

/** Legacy aliases */
export const PROJECT_FALLBACK_MODEL = PROJECT_VISION_FALLBACK_MODEL
export const PROJECT_MODEL_CHAIN = [PROJECT_PRIMARY_MODEL_OPENROUTER, PROJECT_VISION_FALLBACK_MODEL] as const
