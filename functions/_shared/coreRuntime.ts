/**
 * NYVEN Core Runtime
 *
 * INPUT → NORMALIZE → CONTEXT → MODEL (tool select) → TOOLS → MODEL STREAM → EVENTS
 */

import type { CoreEvent, CoreRequest, CoreResult, EmitFn } from './coreTypes'
import { planWithTools, streamGeminiChat } from './geminiProvider'
import { streamProjectChat, USER_FACING_AI_UNAVAILABLE } from './openrouter/stream'
import {
  buildServerMemoryContext,
  maybeUpdateConversationSummary,
  searchPastChats,
  wantsPastChatRecall,
} from './memory/service'
import { sanitizeExtractedText } from './sanitizeExtracted'
import type { OpenRouterMessage } from './openrouter/stream'
import { toGeminiFunctionDeclarations } from './tools/registry'
import { executeTool } from './tools/executor'
import { NYVEN_SYSTEM_INSTRUCTION } from './nyvenPolicy'
import {
  isSearchConfigured,
  formatSearchForModel,
  citationsFromSearch,
  type SearchEnv,
} from './tools/webSearch'
import type { WebSearchResponse } from './tools/types'
import { TOOL_LOOP_LIMITS } from './tools/types'

/** Appended to system instruction only when Serper/Brave/Tavily is configured. */
const WEB_SEARCH_SYSTEM_ADDENDUM = `
Live web search:
- You HAVE a live web_search tool connected to real search APIs (Serper/Google primary).
- For recent events, current news, new releases, live scores, prices, "today/this week/latest", or anything after your knowledge cutoff, you MUST call web_search before answering.
- Do NOT say you lack live browsing, web access, or real-time information when this tool is available.
- After search results return, ground your answer in those results and cite sources by title/domain. Never invent URLs.
- For ordinary knowledge, math, coding, or creative tasks that do not need current external data, answer directly without searching.
`

export type CoreRuntimeEnv = {
  GEMINI_API_KEY?: string
  GEMINI_CHAT_MODEL?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  BRAVE_SEARCH_API_KEY?: string
  TAVILY_API_KEY?: string
  OPENROUTER_API_KEY?: string
  DB?: import('./db/types').D1Database
  NVIDIA_API_KEY?: string
  APP_URL?: string
}

function emit(emitFn: EmitFn, event: CoreEvent) {
  try {
    emitFn(event)
  } catch {
    /* never break the stream on emit failure */
  }
}

function normalizeAttachments(raw: CoreRequest['attachments']) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
    .slice(0, 5)
    .map((a) => ({
      id: String(a.id),
      name: String(a.name).slice(0, 200),
      mimeType: String(a.mimeType || 'application/octet-stream'),
      size: Number(a.size) || 0,
      kind: (a.kind === 'image' || a.kind === 'document' || a.kind === 'text'
        ? a.kind
        : 'text') as 'image' | 'document' | 'text',
      extractedText:
        typeof a.extractedText === 'string' ? a.extractedText.slice(0, 80_000) : undefined,
      inlineBase64:
        typeof a.inlineBase64 === 'string' ? a.inlineBase64 : undefined,
    }))
}

function normalizeRequest(raw: CoreRequest): { ok: true; request: CoreRequest } | { ok: false; code: string; message: string } {
  const attachments = normalizeAttachments(raw?.attachments)
  const message = typeof raw?.message === 'string' ? raw.message.trim() : ''

  if (!message && attachments.length === 0) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Message or attachment is required.',
    }
  }

  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (m) =>
            m &&
            typeof m.content === 'string' &&
            (m.role === 'user' || m.role === 'assistant')
        )
        .map((m) => ({ role: m.role, content: m.content }))
    : []

  return {
    ok: true,
    request: {
      message: message || 'Please analyze the attached content.',
      history,
      attachments,
      userContext: raw.userContext ?? null,
      agentContext: raw.agentContext ?? null,
      mode: raw.mode || 'chat',
      metadata: raw.metadata || {},
    },
  }
}

/**
 * Run Core for a chat request. Emits activity/token/done/error via emitFn.
 * signal: client AbortSignal for cancellation.
 */
export async function runCore(
  env: CoreRuntimeEnv,
  rawRequest: CoreRequest,
  emitFn: EmitFn,
  signal?: AbortSignal
): Promise<CoreResult> {
  const messageId =
    rawRequest.metadata?.messageId ||
    `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const normalized = normalizeRequest(rawRequest)
  if (!normalized.ok) {
    emit(emitFn, {
      type: 'error',
      code: normalized.code,
      message: normalized.message,
      timestamp: Date.now(),
    })
    return {
      messageId,
      text: '',
      error: { code: normalized.code, message: normalized.message },
    }
  }

  // Declared once for both Project OpenRouter path and Gemini system instruction path.
  const userId =
    typeof (rawRequest as any).identity?.userId === 'string'
      ? (rawRequest as any).identity.userId
      : typeof rawRequest.metadata?.userId === 'string'
        ? rawRequest.metadata.userId
        : ''
  const projectId =
    typeof rawRequest.metadata?.projectId === 'string' ? rawRequest.metadata.projectId : ''
  const projectContext =
    typeof rawRequest.metadata?.projectContext === 'string'
      ? rawRequest.metadata.projectContext.trim()
      : ''

  // ── Project mode: OpenRouter Nemotron (real streaming + fallback) ──
  if (projectId) {
    const orKey = (env.OPENROUTER_API_KEY || '').trim()
    const nvidiaKey = (env.NVIDIA_API_KEY || '').trim()
    if (!orKey && !nvidiaKey) {
      const message = USER_FACING_AI_UNAVAILABLE
      emit(emitFn, { type: 'error', code: 'CONFIG', message, timestamp: Date.now() })
      return { messageId, text: '', error: { code: 'CONFIG', message } }
    }

    emit(emitFn, {
      type: 'activity',
      state: 'thinking',
      detail: 'Working on your project',
      timestamp: Date.now(),
    })

    const systemPartsProject = [NYVEN_SYSTEM_INSTRUCTION]
    if (projectContext) systemPartsProject.push(projectContext)
    const memoryEnabled = rawRequest.metadata?.memoryEnabled !== false
    try {
      if (env.DB && userId && memoryEnabled) {
        const mem = await buildServerMemoryContext(env.DB, userId, normalized.request.message || '', {
          projectId,
          memoryEnabled,
        })
        if (mem) systemPartsProject.push(mem)
        if (wantsPastChatRecall(normalized.request.message || '')) {
          const hist = (rawRequest.history || []).slice(-4).map((h: any) => h.content || '')
          const recall = await searchPastChats(env.DB, userId, normalized.request.message || '', hist)
          if (recall) systemPartsProject.push(recall)
        }
      }
    } catch (e) {
      console.error('memory context', e instanceof Error ? e.message : e)
    }
    systemPartsProject.push(
      "You are assisting inside a NYVEN Project workspace. Be professional, organized, and precise. Process the user's actual request dynamically. Do not invent completed work."
    )

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPartsProject.join('\n\n') },
    ]

    const hist = Array.isArray(rawRequest.history) ? rawRequest.history.slice(-24) : []
    for (const h of hist) {
      if (!h?.content) continue
      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })
    }

    const atts = normalizeAttachments(rawRequest.attachments)
    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = []
    const textBits: string[] = []
    if (normalized.request.message) textBits.push(normalized.request.message)
    for (const a of atts) {
      if (a.kind === 'image' && a.inlineBase64) {
        const mime = a.mimeType || 'image/jpeg'
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${a.inlineBase64}` },
        })
      } else if (a.extractedText) {
        const clean = sanitizeExtractedText(a.extractedText)
        console.log(
          '[nyven-att]',
          a.name,
          'len=',
          clean.length,
          'preview=',
          JSON.stringify(clean.slice(0, 200))
        )
        if (clean) {
          textBits.push(
            `[File content of "${a.name}" — this is the actual extracted text from the file; use it, do not ask the user to paste it]\n${clean.slice(0, 40000)}`
          )
        } else {
          textBits.push(
            `[File "${a.name}" has no readable text extract (may be scanned or unsupported). Say so plainly if asked.]`
          )
        }
      }

    const userContent =
      imageParts.length > 0
        ? ([{ type: 'text', text: textBits.join('\n\n') || 'Please analyze the attached content.' }, ...imageParts] as OpenRouterMessage['content'])
        : textBits.join('\n\n') || 'Continue.'

    messages.push({ role: 'user', content: userContent })

    emit(emitFn, {
      type: 'activity',
      state: 'generating',
      detail: 'Generating',
      timestamp: Date.now(),
    })

    const hasImages = imageParts.length > 0
    let full = ''
    const streamResult = await streamProjectChat(
      {
        openRouterKey: orKey || undefined,
        nvidiaKey: nvidiaKey || undefined,
        hasImages,
        siteUrl: env.APP_URL || 'https://nyven.vexdyn.tech',
        siteName: 'NYVEN',
      },
      messages,
      {
        signal,
        onToken: (text) => {
          full += text
          emit(emitFn, { type: 'token', text, timestamp: Date.now() })
        },
        onActivity: (detail) => {
          emit(emitFn, {
            type: 'activity',
            state: 'thinking',
            detail,
            timestamp: Date.now(),
          })
        },
      }
    )

    if (!streamResult.ok && !full) {
      const message = streamResult.message || USER_FACING_AI_UNAVAILABLE
      emit(emitFn, {
        type: 'error',
        code: streamResult.code || 'MODEL_UNAVAILABLE',
        message,
        timestamp: Date.now(),
      })
      return { messageId, text: '', error: { code: streamResult.code || 'MODEL_UNAVAILABLE', message } }
    }

    emit(emitFn, { type: 'activity', state: 'completed', timestamp: Date.now() })
    emit(emitFn, { type: 'done', messageId, timestamp: Date.now() })
    return { messageId, text: full }
  }

  const apiKey = (env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    const message =
      'NYVEN chat is not configured: GEMINI_API_KEY is missing on Cloudflare Pages. Add it under Settings → Environment variables (Production), mark as Secret, then redeploy.'
    emit(emitFn, {
      type: 'error',
      code: 'CONFIG_ERROR',
      message,
      timestamp: Date.now(),
    })
    return { messageId, text: '', error: { code: 'CONFIG_ERROR', message } }
  }

  // Authoritative activity: thinking
  emit(emitFn, {
    type: 'activity',
    state: 'thinking',
    detail: 'Understanding your message',
    timestamp: Date.now(),
  })

  if (signal?.aborted) {
    emit(emitFn, { type: 'done', messageId, timestamp: Date.now() })
    return { messageId, text: '', aborted: true }
  }

  const attachments = Array.isArray(normalized.request.attachments)
    ? normalized.request.attachments
    : []

  if (attachments.length > 0) {
    for (const a of attachments) {
      emit(emitFn, {
        type: 'attachment_status',
        attachmentId: a.id,
        status: 'processing',
        detail: a.name,
        timestamp: Date.now(),
      })
    }
    const hasDocs = attachments.some(
      (a) => a.kind === 'document' || a.kind === 'text' || a.extractedText
    )
    const hasImages = attachments.some((a) => a.kind === 'image')
    if (hasDocs) {
      emit(emitFn, {
        type: 'activity',
        state: 'reading',
        detail: 'Reading attached files',
        timestamp: Date.now(),
      })
    }
    if (hasImages || attachments.some((a) => a.mimeType === 'application/pdf')) {
      emit(emitFn, {
        type: 'activity',
        state: 'analyzing',
        detail: 'Analyzing attachments',
        timestamp: Date.now(),
      })
    }
    for (const a of attachments) {
      emit(emitFn, {
        type: 'attachment_status',
        attachmentId: a.id,
        status: 'ready',
        detail: a.name,
        timestamp: Date.now(),
      })
    }
  }

  const providerConfig: {
    apiKey: string
    model: string
    systemInstruction?: string
  } = {
    apiKey,
    model: env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
  }

  const searchEnv: SearchEnv = {
    SERPER_API_KEY: env.SERPER_API_KEY,
    BRAVE_API_KEY: env.BRAVE_API_KEY,
    BRAVE_SEARCH_API_KEY: env.BRAVE_SEARCH_API_KEY,
    TAVILY_API_KEY: env.TAVILY_API_KEY,
  }

  const searchReady = isSearchConfigured(searchEnv)
  // Only expose web_search when a provider key is actually configured
  const functionDeclarations = searchReady ? toGeminiFunctionDeclarations() : []
  let systemParts = [NYVEN_SYSTEM_INSTRUCTION]
  if (searchReady) systemParts.push(WEB_SEARCH_SYSTEM_ADDENDUM)
  // Reuse projectContext declared once at start of runCore.
  if (projectContext) systemParts.push(projectContext)
  const memoryEnabledNormal = rawRequest.metadata?.memoryEnabled !== false
  try {
    if (env.DB && userId && memoryEnabledNormal) {
      const mem = await buildServerMemoryContext(env.DB, userId, normalized.request.message || '', {
        projectId: projectId || null,
        memoryEnabled: memoryEnabledNormal,
      })
      if (mem) systemParts.push(mem)
      if (wantsPastChatRecall(normalized.request.message || '')) {
        const hist = (rawRequest.history || []).slice(-4).map((h: any) => h.content || '')
        const recall = await searchPastChats(env.DB, userId, normalized.request.message || '', hist)
        if (recall) systemParts.push(recall)
      }
    }
  } catch (e) {
    console.error('memory context', e instanceof Error ? e.message : e)
  }

  providerConfig.systemInstruction = systemParts.join('\n\n')
  const toolContextBlocks: string[] = []
  const allCitations: Array<{ id: string; title: string; url: string; source?: string }> = []
  const seenQueries = new Set<string>()
  let toolCalls = 0

  // Tool selection loop (model decides — no keyword hacks)
  while (toolCalls < TOOL_LOOP_LIMITS.MAX_TOOL_CALLS_PER_TURN) {
    if (signal?.aborted) break

    const extra =
      toolContextBlocks.length > 0
        ? toolContextBlocks.join('\n\n')
        : undefined

    const plan = await planWithTools(
      providerConfig,
      normalized.request.message,
      normalized.request.history,
      attachments as any,
      functionDeclarations,
      signal,
      extra
    )

    if (plan.kind === 'error') {
      if (plan.code === 'ABORTED') {
        emit(emitFn, {
          type: 'activity',
          state: 'completed',
          detail: 'Stopped',
          timestamp: Date.now(),
        })
        emit(emitFn, { type: 'done', messageId, timestamp: Date.now(), citations: allCitations })
        return { messageId, text: '', aborted: true }
      }
      emit(emitFn, { type: 'activity', state: 'error', timestamp: Date.now() })
      emit(emitFn, {
        type: 'error',
        code: plan.code,
        message: plan.message,
        timestamp: Date.now(),
      })
      return {
        messageId,
        text: '',
        error: { code: plan.code, message: plan.message },
      }
    }

    if (plan.kind === 'text') {
      // Model answered without tools — stream that text as tokens for consistent UX
      emit(emitFn, {
        type: 'activity',
        state: 'generating',
        detail: 'Writing a response',
        timestamp: Date.now(),
      })
      // Re-stream via streaming path for better UX, OR emit tokens from plan text
      // Prefer real stream with tool context for consistency when tools were used
      if (toolContextBlocks.length === 0) {
        // Pure text plan: still stream from model for natural token flow
        const streamResult = await streamGeminiChat(
          providerConfig,
          normalized.request.message,
          normalized.request.history,
          {
            signal,
            onToken: (text) => {
              emit(emitFn, { type: 'token', text, timestamp: Date.now() })
            },
          },
          attachments as any
        )
        if (signal?.aborted) {
          emit(emitFn, {
            type: 'done',
            messageId,
            timestamp: Date.now(),
            citations: allCitations,
          })
          return { messageId, text: streamResult.ok ? streamResult.text : '', aborted: true }
        }
        if (!streamResult.ok) {
          // Fall back to planned text if stream fails but we had plan text
          for (const chunk of plan.text.match(/.{1,24}/gs) || [plan.text]) {
            emit(emitFn, { type: 'token', text: chunk, timestamp: Date.now() })
          }
        }
        emit(emitFn, {
          type: 'activity',
          state: 'completed',
          timestamp: Date.now(),
        })
        emit(emitFn, {
          type: 'done',
          messageId,
          timestamp: Date.now(),
          citations: allCitations.length ? allCitations : undefined,
        })
        return {
          messageId,
          text: streamResult.ok ? streamResult.text : plan.text,
        }
      }
      // Had tools: stream synthesis with tool context
      break
    }

    // Function calls
    for (const call of plan.calls) {
      if (toolCalls >= TOOL_LOOP_LIMITS.MAX_TOOL_CALLS_PER_TURN) break
      if (signal?.aborted) break

      const toolCallId = `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      toolCalls += 1

      if (call.name === 'web_search') {
        const q = String((call.args as { query?: string })?.query || '').trim().toLowerCase()
        if (q && seenQueries.has(q)) {
          toolContextBlocks.push(
            '=== BEGIN TOOL RESULT: WEB SEARCH ===\nDuplicate query skipped.\n=== END TOOL RESULT ==='
          )
          continue
        }
        if (q) seenQueries.add(q)

        emit(emitFn, {
          type: 'activity',
          state: 'searching',
          detail: String((call.args as { query?: string })?.query || 'web'),
          timestamp: Date.now(),
        })
        emit(emitFn, {
          type: 'tool_call',
          toolCallId,
          toolId: 'web_search',
          input: { query: (call.args as { query?: string })?.query },
          timestamp: Date.now(),
        })

        const result = await executeTool(
          searchEnv,
          'web_search',
          call.args,
          { signal, requestId: messageId },
          toolCallId
        )

        if (result.success && result.data) {
          const data = result.data as WebSearchResponse
          const cites = citationsFromSearch(data)
          // Remap citation ids to be unique across multiple searches
          for (const c of cites) {
            allCitations.push({
              ...c,
              id: `c${allCitations.length + 1}`,
            })
          }
          toolContextBlocks.push(formatSearchForModel(data))
          emit(emitFn, {
            type: 'tool_result',
            toolCallId,
            toolId: 'web_search',
            success: true,
            summary: `Found ${data.results.length} source${data.results.length === 1 ? '' : 's'}`,
            timestamp: Date.now(),
          })
        } else {
          const errMsg = result.error?.message || 'Search failed.'
          toolContextBlocks.push(
            `=== BEGIN TOOL RESULT: WEB SEARCH ===\nSearch failed: ${errMsg}\n=== END TOOL RESULT ===`
          )
          emit(emitFn, {
            type: 'tool_result',
            toolCallId,
            toolId: 'web_search',
            success: false,
            summary: errMsg,
            timestamp: Date.now(),
          })
        }
      } else {
        // Unknown / disabled tool from model
        emit(emitFn, {
          type: 'tool_call',
          toolCallId,
          toolId: call.name,
          input: call.args,
          timestamp: Date.now(),
        })
        const result = await executeTool(
          searchEnv,
          call.name,
          call.args,
          { signal },
          toolCallId
        )
        emit(emitFn, {
          type: 'tool_result',
          toolCallId,
          toolId: call.name,
          success: result.success,
          summary: result.error?.message || 'Done',
          timestamp: Date.now(),
        })
        toolContextBlocks.push(
          `=== BEGIN TOOL RESULT: ${call.name} ===\n${result.error?.message || JSON.stringify(result.data)}\n=== END TOOL RESULT ===`
        )
      }
    }

    // Continue loop so model can reason over tool results
  }

  if (signal?.aborted) {
    emit(emitFn, {
      type: 'done',
      messageId,
      timestamp: Date.now(),
      citations: allCitations.length ? allCitations : undefined,
    })
    return { messageId, text: '', aborted: true }
  }

  // Final generation (with tool context if any)
  if (toolContextBlocks.length > 0) {
    emit(emitFn, {
      type: 'activity',
      state: 'analyzing',
      detail: 'Analyzing sources',
      timestamp: Date.now(),
    })
  }

  emit(emitFn, {
    type: 'activity',
    state: 'generating',
    detail: 'Writing a response',
    timestamp: Date.now(),
  })

  const finalMessage =
    toolContextBlocks.length > 0
      ? `${normalized.request.message}\n\n${toolContextBlocks.join('\n\n')}\n\nUsing only the tool results above when relevant, answer the user. Cite sources by title/domain when making factual claims from search. Do not invent URLs.`
      : normalized.request.message

  const streamResult = await streamGeminiChat(
    providerConfig,
    finalMessage,
    normalized.request.history,
    {
      signal,
      onToken: (text) => {
        emit(emitFn, { type: 'token', text, timestamp: Date.now() })
      },
    },
    attachments as any
  )

  if (signal?.aborted) {
    emit(emitFn, {
      type: 'activity',
      state: 'completed',
      detail: 'Stopped',
      timestamp: Date.now(),
    })
    emit(emitFn, {
      type: 'done',
      messageId,
      timestamp: Date.now(),
      citations: allCitations.length ? allCitations : undefined,
    })
    return {
      messageId,
      text: streamResult.ok ? streamResult.text : '',
      aborted: true,
    }
  }

  if (!streamResult.ok) {
    if (streamResult.code === 'ABORTED') {
      emit(emitFn, {
        type: 'done',
        messageId,
        timestamp: Date.now(),
        citations: allCitations.length ? allCitations : undefined,
      })
      return { messageId, text: '', aborted: true }
    }
    emit(emitFn, { type: 'activity', state: 'error', timestamp: Date.now() })
    emit(emitFn, {
      type: 'error',
      code: streamResult.code,
      message: streamResult.message,
      timestamp: Date.now(),
    })
    return {
      messageId,
      text: '',
      error: { code: streamResult.code, message: streamResult.message },
    }
  }

  emit(emitFn, {
    type: 'activity',
    state: 'completed',
    timestamp: Date.now(),
  })
  emit(emitFn, {
    type: 'done',
    messageId,
    timestamp: Date.now(),
    citations: allCitations.length ? allCitations : undefined,
  })

  return { messageId, text: streamResult.text }
}
