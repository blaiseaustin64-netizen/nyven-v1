/**
 * NYVEN Core client — consumes SSE from POST /api/chat.
 */

import type { ActivityState, CoreEvent, StreamHandlers } from './types'

export type ChatStreamRequest = {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  attachments?: Array<{
    id: string
    name: string
    mimeType: string
    size: number
    kind: 'image' | 'document' | 'text'
    extractedText?: string
    inlineBase64?: string
  }>
  /** Supabase access token — verified server-side; omit for guests */
  accessToken?: string | null
  signal?: AbortSignal
}

/**
 * Parse an SSE buffer into complete events; return remainder.
 */
function consumeSseBuffer(
  buffer: string,
  onEvent: (eventName: string, data: string) => void
): string {
  const blocks = buffer.split('\n\n')
  const incomplete = blocks.pop() ?? ''

  for (const block of blocks) {
    if (!block.trim()) continue
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (dataLines.length) {
      onEvent(eventName, dataLines.join('\n'))
    }
  }

  return incomplete
}

function dispatchEvent(raw: string, handlers: StreamHandlers) {
  let event: CoreEvent
  try {
    event = JSON.parse(raw) as CoreEvent
  } catch {
    return
  }

  switch (event.type) {
    case 'activity':
      handlers.onActivity?.(
        (event as { state: ActivityState }).state,
        (event as { detail?: string }).detail
      )
      break
    case 'token':
      handlers.onToken?.((event as { text: string }).text || '')
      break
    case 'tool_call':
      handlers.onToolCall?.(
        (event as { toolId: string }).toolId || '',
        (event as { input?: unknown }).input
      )
      break
    case 'tool_result':
      handlers.onToolResult?.(
        (event as { toolId: string }).toolId || '',
        Boolean((event as { success?: boolean }).success),
        (event as { summary?: string }).summary
      )
      break
    case 'done':
      handlers.onDone?.(
        (event as { messageId: string }).messageId || '',
        (event as { citations?: Array<{ id: string; title: string; url: string; source?: string }> }).citations
      )
      break
    case 'error':
      handlers.onError?.(
        (event as { code: string }).code || 'ERROR',
        (event as { message: string }).message || 'Something went wrong.'
      )
      break
    default:
      break
  }
}

/**
 * Stream a chat completion from Core. Resolves when stream ends.
 */
export async function streamCoreChat(
  req: ChatStreamRequest,
  handlers: StreamHandlers
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (req.accessToken) {
    headers.Authorization = `Bearer ${req.accessToken}`
  }

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: req.message,
      history: req.history,
      attachments: req.attachments || [],
    }),
    signal: req.signal,
  })

  const contentType = res.headers.get('content-type') || ''
  if (!res.ok && !contentType.includes('text/event-stream')) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      code?: string
    }
    const code =
      res.status === 401 ? 'AUTH_INVALID' : data.code || 'REQUEST_FAILED'
    handlers.onError?.(
      code,
      data.error || 'NYVEN could not complete that request.'
    )
    return
  }

  if (!res.body) {
    handlers.onError?.('STREAM_ERROR', 'NYVEN could not complete that request.')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = consumeSseBuffer(buffer, (_name, data) => {
        dispatchEvent(data, handlers)
      })
    }
    if (buffer.trim()) {
      consumeSseBuffer(buffer + '\n\n', (_name, data) => {
        dispatchEvent(data, handlers)
      })
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError' || req.signal?.aborted) {
      return
    }
    handlers.onError?.(
      'STREAM_INTERRUPTED',
      'The response was interrupted. Please try again.'
    )
  }
}
