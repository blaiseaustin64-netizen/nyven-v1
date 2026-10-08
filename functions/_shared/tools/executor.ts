/**
 * Tool executor — only registered, enabled tools; permission checks; timeouts.
 */

import { getTool } from './registry'
import { executeWebSearch, type SearchEnv } from './webSearch'
import type { ToolContext, ToolResult } from './types'

export type ExecutorEnv = SearchEnv

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      return
    }
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('timeout'), { code: 'TOOL_TIMEOUT' }))
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise
      .then((v) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      })
  })
}

export async function executeTool(
  env: ExecutorEnv,
  toolId: string,
  input: unknown,
  context: ToolContext,
  toolCallId: string
): Promise<ToolResult> {
  const def = getTool(toolId)
  if (!def) {
    return {
      toolCallId,
      toolId,
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: 'That tool is not available.',
      },
    }
  }
  if (!def.enabled) {
    return {
      toolCallId,
      toolId,
      success: false,
      error: {
        code: 'TOOL_DISABLED',
        message: 'That tool is not enabled.',
      },
    }
  }
  if (def.requiresApproval) {
    return {
      toolCallId,
      toolId,
      success: false,
      error: {
        code: 'TOOL_NOT_PERMITTED',
        message: 'This action requires approval and is not available yet.',
      },
    }
  }

  try {
    if (toolId === 'web_search') {
      const query =
        input && typeof input === 'object' && typeof (input as { query?: string }).query === 'string'
          ? (input as { query: string }).query
          : ''
      const result = await withTimeout(
        executeWebSearch(env, query, context.signal),
        def.timeoutMs,
        context.signal
      )
      if (!result.ok) {
        return {
          toolCallId,
          toolId,
          success: false,
          error: result.error,
        }
      }
      return {
        toolCallId,
        toolId,
        success: true,
        data: result.data,
        metadata: { resultCount: result.data.results.length },
      }
    }

    return {
      toolCallId,
      toolId,
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: 'That tool is not implemented.',
      },
    }
  } catch (err: unknown) {
    if (context.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      return {
        toolCallId,
        toolId,
        success: false,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: 'Tool execution was cancelled.',
        },
      }
    }
    if ((err as { code?: string })?.code === 'TOOL_TIMEOUT') {
      return {
        toolCallId,
        toolId,
        success: false,
        error: {
          code: 'TOOL_TIMEOUT',
          message: 'The tool timed out. Please try again.',
        },
      }
    }
    return {
      toolCallId,
      toolId,
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Tool execution failed.',
      },
    }
  }
}
