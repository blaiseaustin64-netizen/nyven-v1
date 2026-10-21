/**
 * NYVEN usage policy — server-enforced defaults.
 * Override via env without code changes where noted.
 */

/** Daily reset timezone (UTC date key). Documented for operators. */
export const USAGE_DAY_TIMEZONE = 'UTC'

export type UsageLimits = {
  chatPerDay: number
  voiceSecondsPerDay: number
  maxVoiceSessionSeconds: number
}

export const GUEST_LIMITS: UsageLimits = {
  chatPerDay: 5,
  voiceSecondsPerDay: 60,
  maxVoiceSessionSeconds: 300,
}

export const USER_LIMITS: UsageLimits = {
  chatPerDay: 100,
  voiceSecondsPerDay: 15 * 60,
  maxVoiceSessionSeconds: 300,
}

/** Burst: max chat posts per subject per minute */
export const CHAT_BURST_PER_MINUTE = 10

/** Verification / email send limits */
export const EMAIL_SEND_PER_HOUR = 5
export const VERIFY_ATTEMPTS_MAX = 5
export const VERIFY_CODE_TTL_MS = 15 * 60 * 1000

/** Provider-wide daily budgets (circuit breakers). Configurable via env. */
export const DEFAULT_PROVIDER_BUDGETS: Record<string, number> = {
  gemini: 2000,
  openrouter: 40,
  openrouter_tts: 200,
  stt: 500,
  web_search: 500,
}

export function limitsFor(authenticated: boolean): UsageLimits {
  return authenticated ? USER_LIMITS : GUEST_LIMITS
}

/** UTC YYYY-MM-DD for daily counters */
export function dayKeyUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function parseProviderBudgetEnv(env: {
  PROVIDER_BUDGET_GEMINI?: string
  PROVIDER_BUDGET_OPENROUTER?: string
  PROVIDER_BUDGET_OPENROUTER_TTS?: string
  PROVIDER_BUDGET_STT?: string
  PROVIDER_BUDGET_WEB_SEARCH?: string
}): Record<string, number> {
  const n = (v: string | undefined, fallback: number) => {
    const x = v ? parseInt(v, 10) : NaN
    return Number.isFinite(x) && x > 0 ? x : fallback
  }
  return {
    gemini: n(env.PROVIDER_BUDGET_GEMINI, DEFAULT_PROVIDER_BUDGETS.gemini),
    openrouter: n(env.PROVIDER_BUDGET_OPENROUTER, DEFAULT_PROVIDER_BUDGETS.openrouter),
    openrouter_tts: n(
      env.PROVIDER_BUDGET_OPENROUTER_TTS,
      DEFAULT_PROVIDER_BUDGETS.openrouter_tts
    ),
    stt: n(env.PROVIDER_BUDGET_STT, DEFAULT_PROVIDER_BUDGETS.stt),
    web_search: n(env.PROVIDER_BUDGET_WEB_SEARCH, DEFAULT_PROVIDER_BUDGETS.web_search),
  }
}
