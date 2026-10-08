/**
 * SSE helpers for Core event streaming over Cloudflare Responses.
 */

import type { CoreEvent } from './coreTypes'

export function formatSseEvent(event: CoreEvent): string {
  // Use event.type as SSE event name for simple client parsing
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export function createSseStream(
  run: (emit: (event: CoreEvent) => void, signal: AbortSignal) => Promise<void>
): Response {
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
  const abort = new AbortController()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller

      const emit = (event: CoreEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)))
        } catch {
          /* stream may be closed */
        }
      }

      // Kick off async work
      ;(async () => {
        try {
          await run(emit, abort.signal)
        } catch (err: unknown) {
          if (!abort.signal.aborted) {
            const message =
              err instanceof Error ? err.message : 'Unexpected server error.'
            try {
              controller.enqueue(
                encoder.encode(
                  formatSseEvent({
                    type: 'error',
                    code: 'INTERNAL_ERROR',
                    message: 'NYVEN could not complete that request. Please try again.',
                    timestamp: Date.now(),
                  })
                )
              )
            } catch {
              /* ignore */
            }
            console.error('NYVEN Core stream error:', message)
          }
        } finally {
          try {
            controller.close()
          } catch {
            /* ignore */
          }
        }
      })()
    },
    cancel() {
      abort.abort()
      streamController = null
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
