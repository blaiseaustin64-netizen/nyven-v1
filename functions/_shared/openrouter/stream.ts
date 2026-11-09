/**
 * Real streaming for Project AI via NVIDIA direct and/or OpenRouter.
 * Token deltas are forwarded as-is (no fake chunking).
 */

import {
  isRetryableProviderFailure,
  NVIDIA_BASE_URL,
  PROJECT_PRIMARY_MODEL,
  PROJECT_PRIMARY_MODEL_OPENROUTER,
  PROJECT_VISION_FALLBACK_MODEL,
  USER_FACING_AI_UNAVAILABLE,
} from './models'

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

export type OpenRouterStreamHandlers = {
  onToken: (text: string) => void
  onActivity?: (detail: string) => void
  signal?: AbortSignal
}

export type OpenRouterStreamResult =
  | { ok: true; text: string; model: string }
  | { ok: false; code: string; message: string; httpStatus?: number }

export type OpenRouterStreamConfig = {
  apiKey: string
  baseUrl?: string
  models?: string[]
  temperature?: number
  maxTokens?: number
  siteUrl?: string
  siteName?: string
}

function buildHeaders(cfg: OpenRouterStreamConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (cfg.siteUrl) headers['HTTP-Referer'] = cfg.siteUrl
  if (cfg.siteName) headers['X-Title'] = cfg.siteName
  return headers
}

async function streamOneModel(
  cfg: OpenRouterStreamConfig,
  model: string,
  messages: OpenRouterMessage[],
  handlers: OpenRouterStreamHandlers
): Promise<OpenRouterStreamResult> {
  const base = (cfg.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: cfg.temperature ?? 0.7,
        max_tokens: cfg.maxTokens ?? 4096,
      }),
      signal: handlers.signal,
    })
  } catch (err: unknown) {
    if (handlers.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      return { ok: false, code: 'ABORTED', message: 'Generation stopped.' }
    }
    return { ok: false, code: 'MODEL_UNAVAILABLE', message: USER_FACING_AI_UNAVAILABLE }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (isRetryableProviderFailure(res.status, errText)) {
      return { ok: false, code: 'RETRYABLE', message: USER_FACING_AI_UNAVAILABLE, httpStatus: res.status }
    }
    return { ok: false, code: 'MODEL_UNAVAILABLE', message: USER_FACING_AI_UNAVAILABLE, httpStatus: res.status }
  }

  if (!res.body) {
    return { ok: false, code: 'MODEL_UNAVAILABLE', message: USER_FACING_AI_UNAVAILABLE }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let emitted = false
  let activityEmitted = false

  try {
    while (true) {
      if (handlers.signal?.aborted) {
        try {
          await reader.cancel()
        } catch {
          /* */
        }
        return { ok: true, text: fullText, model }
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() || ''
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null
                reasoning_content?: string | null
                reasoning?: string | null
              }
              message?: { content?: string }
            }>
            error?: { message?: string }
          }
          if (json.error?.message) {
            if (emitted) {
              return { ok: false, code: 'STREAM_INTERRUPTED', message: USER_FACING_AI_UNAVAILABLE }
            }
            return {
              ok: false,
              code: isRetryableProviderFailure(500, json.error.message) ? 'RETRYABLE' : 'MODEL_UNAVAILABLE',
              message: USER_FACING_AI_UNAVAILABLE,
            }
          }
          const deltaObj = json.choices?.[0]?.delta
          const reasoning = deltaObj?.reasoning_content || deltaObj?.reasoning
          if (reasoning && !activityEmitted) {
            activityEmitted = true
            handlers.onActivity?.('Thinking')
          }
          const delta = deltaObj?.content ?? json.choices?.[0]?.message?.content ?? ''
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta
            emitted = true
            handlers.onToken(delta)
          }
        } catch {
          /* partial JSON */
        }
      }
    }
  } catch (err: unknown) {
    if (handlers.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      return { ok: true, text: fullText, model }
    }
    if (emitted) return { ok: false, code: 'STREAM_INTERRUPTED', message: USER_FACING_AI_UNAVAILABLE }
    return { ok: false, code: 'RETRYABLE', message: USER_FACING_AI_UNAVAILABLE }
  }

  return { ok: true, text: fullText, model }
}

/**
 * Stream a Project completion with model routing.
 * - Images → vision fallback first, then primary
 * - Text → primary (NVIDIA direct or OpenRouter), then vision fallback
 * Only retries before meaningful content is emitted.
 */
export async function streamProjectChat(
  cfg: {
    openRouterKey?: string
    nvidiaKey?: string
    hasImages?: boolean
    temperature?: number
    maxTokens?: number
    siteUrl?: string
    siteName?: string
  },
  messages: OpenRouterMessage[],
  handlers: OpenRouterStreamHandlers
): Promise<OpenRouterStreamResult> {
  type Attempt = { key: string; baseUrl: string; model: string; site?: boolean }
  const attempts: Attempt[] = []

  if (cfg.hasImages) {
    if (cfg.openRouterKey) {
      attempts.push({
        key: cfg.openRouterKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: PROJECT_VISION_FALLBACK_MODEL,
        site: true,
      })
    }
  }

  if (cfg.nvidiaKey) {
    attempts.push({
      key: cfg.nvidiaKey,
      baseUrl: NVIDIA_BASE_URL,
      model: PROJECT_PRIMARY_MODEL,
    })
  }
  if (cfg.openRouterKey) {
    attempts.push({
      key: cfg.openRouterKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: PROJECT_PRIMARY_MODEL_OPENROUTER,
      site: true,
    })
    if (!cfg.hasImages) {
      attempts.push({
        key: cfg.openRouterKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: PROJECT_VISION_FALLBACK_MODEL,
        site: true,
      })
    }
  }

  if (!attempts.length) {
    return { ok: false, code: 'CONFIG', message: USER_FACING_AI_UNAVAILABLE }
  }

  let last: OpenRouterStreamResult | null = null
  for (const a of attempts) {
    const result = await streamOneModel(
      {
        apiKey: a.key,
        baseUrl: a.baseUrl,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        siteUrl: a.site ? cfg.siteUrl : undefined,
        siteName: a.site ? cfg.siteName : undefined,
      },
      a.model,
      messages,
      handlers
    )
    if (result.ok) return result
    if (result.code === 'STREAM_INTERRUPTED' || result.code === 'ABORTED') return result
    if (result.code !== 'RETRYABLE' && result.code !== 'MODEL_UNAVAILABLE') return result
    last = result
  }
  return last || { ok: false, code: 'MODEL_UNAVAILABLE', message: USER_FACING_AI_UNAVAILABLE }
}

export {
  PROJECT_PRIMARY_MODEL,
  PROJECT_PRIMARY_MODEL_OPENROUTER,
  PROJECT_VISION_FALLBACK_MODEL,
  USER_FACING_AI_UNAVAILABLE,
}
