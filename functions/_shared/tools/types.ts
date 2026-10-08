/**
 * NYVEN Tool Runtime contracts — server-authoritative.
 */

export type ToolPermission = 'read' | 'write' | 'external_side_effect'

export type ToolDefinition = {
  id: string
  name: string
  description: string
  /** JSON-schema-like description for the model */
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
  category: string
  permissions: ToolPermission[]
  requiresConnection?: boolean
  connectionType?: string
  requiresApproval?: boolean
  supportsCancellation?: boolean
  timeoutMs: number
  enabled: boolean
}

export type ToolContext = {
  signal?: AbortSignal
  /** Opaque request metadata */
  requestId?: string
}

export type ToolError = {
  code:
    | 'TOOL_TIMEOUT'
    | 'TOOL_UNAVAILABLE'
    | 'TOOL_INVALID_INPUT'
    | 'TOOL_EXECUTION_FAILED'
    | 'TOOL_NOT_PERMITTED'
    | 'TOOL_RATE_LIMITED'
    | 'TOOL_NOT_FOUND'
    | 'TOOL_DISABLED'
  message: string
}

export type ToolResult = {
  toolCallId: string
  toolId: string
  success: boolean
  data?: unknown
  error?: ToolError
  metadata?: Record<string, unknown>
}

export type ToolExecutor = {
  execute(
    toolId: string,
    input: unknown,
    context: ToolContext,
    toolCallId: string
  ): Promise<ToolResult>
}

/** Normalized web search structures */
export type WebSearchResultItem = {
  title: string
  url: string
  snippet?: string
  source?: string
  publishedAt?: string
}

export type WebSearchResponse = {
  query: string
  results: WebSearchResultItem[]
}

export type Citation = {
  id: string
  title: string
  url: string
  source?: string
}

/** Safety limits for the tool loop */
export const TOOL_LOOP_LIMITS = {
  MAX_TOOL_CALLS_PER_TURN: 3,
  MAX_SEARCH_RESULTS: 8,
  MAX_SNIPPET_LENGTH: 280,
  MAX_SEARCH_CONTEXT_CHARS: 12_000,
  DEFAULT_TIMEOUT_MS: 15_000,
} as const
