import {
  isRetryableProviderFailure,
  PROJECT_FALLBACK_MODEL,
  PROJECT_PRIMARY_MODEL,
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
  signal?: AbortSignal
}

export type OpenRouterStreamResult =
  | { ok: true; text: string; model: string }
  | { ok: false; code: string; message: string; httpStatus?: number }

export type OpenRouterStreamConfig = {
  apiKey: string
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
  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

  try {
    while (true) {
      if (handlers.signal?.aborted) {
        try { await reader.cancel() } catch { /* */ }
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
            choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string } }>
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
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? ''
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta
            emitted = true
            handlers.onToken(delta)
          }
        } catch { /* partial JSON */ }
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

export async function streamProjectChat(
  cfg: OpenRouterStreamConfig,
  messages: OpenRouterMessage[],
  handlers: OpenRouterStreamHandlers
): Promise<OpenRouterStreamResult> {
  const chain = cfg.models?.length ? cfg.models : [PROJECT_PRIMARY_MODEL, PROJECT_FALLBACK_MODEL]
  let last: OpenRouterStreamResult | null = null
  for (const model of chain) {
    const result = await streamOneModel(cfg, model, messages, handlers)
    if (result.ok) return result
    if (result.code === 'STREAM_INTERRUPTED' || result.code === 'ABORTED') return result
    if (result.code !== 'RETRYABLE' && result.code !== 'MODEL_UNAVAILABLE') return result
    last = result
  }
  return last || { ok: false, code: 'MODEL_UNAVAILABLE', message: USER_FACING_AI_UNAVAILABLE }
}

export { PROJECT_PRIMARY_MODEL, PROJECT_FALLBACK_MODEL, USER_FACING_AI_UNAVAILABLE }
