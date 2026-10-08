/**
 * Server-authoritative tool registry.
 * Only registered + enabled tools may execute.
 */

import type { ToolDefinition } from './types'
import { TOOL_LOOP_LIMITS } from './types'

const WEB_SEARCH: ToolDefinition = {
  id: 'web_search',
  name: 'Web Search',
  description:
    'Search the public web for current information, news, prices, people, events, or facts that require up-to-date external data. Do NOT use for general knowledge, coding help, creative writing, or casual conversation.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific and concise.',
      },
    },
    required: ['query'],
  },
  category: 'research',
  permissions: ['read'],
  requiresConnection: false,
  requiresApproval: false,
  supportsCancellation: true,
  timeoutMs: TOOL_LOOP_LIMITS.DEFAULT_TIMEOUT_MS,
  enabled: true,
}

/** Future placeholders — not executable */
const FUTURE_STUBS: ToolDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Access Gmail (not enabled in this phase).',
    parameters: { type: 'object', properties: {} },
    category: 'communication',
    permissions: ['read'],
    requiresConnection: true,
    connectionType: 'gmail',
    requiresApproval: false,
    supportsCancellation: true,
    timeoutMs: 20_000,
    enabled: false,
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Access calendar (not enabled).',
    parameters: { type: 'object', properties: {} },
    category: 'productivity',
    permissions: ['read'],
    requiresConnection: true,
    connectionType: 'calendar',
    requiresApproval: false,
    supportsCancellation: true,
    timeoutMs: 20_000,
    enabled: false,
  },
]

const REGISTRY: Map<string, ToolDefinition> = new Map()

function seed() {
  if (REGISTRY.size > 0) return
  for (const t of [WEB_SEARCH, ...FUTURE_STUBS]) {
    REGISTRY.set(t.id, t)
  }
}

export function getTool(id: string): ToolDefinition | undefined {
  seed()
  return REGISTRY.get(id)
}

export function listEnabledTools(): ToolDefinition[] {
  seed()
  return [...REGISTRY.values()].filter((t) => t.enabled)
}

/** Gemini functionDeclarations from enabled tools */
export function toGeminiFunctionDeclarations(): Array<{
  name: string
  description: string
  parameters: ToolDefinition['parameters']
}> {
  return listEnabledTools().map((t) => ({
    name: t.id,
    description: t.description,
    parameters: t.parameters,
  }))
}
