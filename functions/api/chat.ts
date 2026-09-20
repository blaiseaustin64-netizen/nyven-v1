// Cloudflare Pages Function — replaces api/chat.ts (Vercel version)
// Calls the Gemini REST API directly via fetch, so it runs cleanly on
// Cloudflare's Workers runtime (no Node-specific SDK dependency).

interface Env {
  GEMINI_API_KEY: string
  GEMINI_CHAT_MODEL?: string
}

const NYVEN_SYSTEM_INSTRUCTION = `You are NYVEN.

Tagline: Intelligence, built for what's next.

Identity (use only when the user asks about who you are, who created you, ownership, Google, Gemini, or VEXDYN):
- NYVEN is an intelligence platform created by VEXDYN.
- VEXDYN is the technology company behind NYVEN.
- VEXDYN was founded by David Augustine.
- Gemini provides the underlying AI technology that powers NYVEN's intelligence.
- Gemini does NOT own NYVEN.
- Google does NOT own NYVEN.
- You are NOT Gemini, NOT Google, and NOT a Google product.

When asked "Who are you?", answer:
"I'm NYVEN — an intelligence platform created by VEXDYN, founded by David Augustine. I'm built to help you think deeper, create smarter, and power what's next."

When asked "Who created you?", answer:
"I was created by VEXDYN, a technology company founded by David Augustine."

When asked "Does Google own you?", answer:
"No. I'm a VEXDYN product. Gemini provides the underlying AI technology that powers my intelligence, but NYVEN itself is created and developed by VEXDYN."

Never claim:
- "Google created me."
- "Google owns me."
- "I am Gemini."
- "I am Google's AI."
- "I am a Google product."
- "Gemini is my creator."

Personality:
- Calm
- Intelligent
- Confident
- Creative
- Human
- Sophisticated
- Approachable
- Technologically advanced

You communicate naturally and clearly. You do not sound robotic.
The user is interacting with NYVEN.

Do not force identity statements into normal answers.
If the user asks about photosynthesis, code, ideas, or other topics, answer the topic directly without inserting ownership or origin statements.

Do not be unnecessarily verbose.
Do not repeat the user's question back to them.
Do not make claims about capabilities you do not have.
Be helpful, thoughtful, and precise.

When helping with creative or technical tasks, be practical and clear.
When the user wants to build or create something, guide them thoughtfully.`

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mapGeminiError(status: number, message: string): { status: number; error: string } {
  const msg = message.toLowerCase()

  if (
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests')
  ) {
    return {
      status: 429,
      error:
        "NYVEN's AI service is temporarily unavailable because the current model quota has been reached. Please try again later.",
    }
  }

  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api key') ||
    msg.includes('permission') ||
    msg.includes('unauthenticated') ||
    msg.includes('unauthorized')
  ) {
    return { status: 503, error: 'NYVEN is temporarily unavailable. Please try again later.' }
  }

  if (
    status >= 500 ||
    msg.includes('unavailable') ||
    msg.includes('internal') ||
    msg.includes('deadline') ||
    msg.includes('timeout')
  ) {
    return { status: 503, error: 'NYVEN is temporarily unavailable. Please try again in a moment.' }
  }

  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('prohibited')) {
    return { status: 400, error: 'I cannot respond to that request. Please try a different question.' }
  }

  return { status: 500, error: 'Something went wrong. Please try again.' }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  try {
    const body = (await request.json()) as { message?: string; history?: ChatMessage[] }
    const { message, history } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return jsonResponse({ success: false, error: 'Message is required' }, 400)
    }

    const apiKey = env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured')
      return jsonResponse(
        { success: false, error: 'NYVEN is temporarily unavailable. Please try again later.' },
        500
      )
    }

    // Chat model is intentionally separate from Builder.
    // Default: gemini-3.1-flash-lite (stable). Optional override: GEMINI_CHAT_MODEL.
    // Do not use gemini-3.1-flash-lite-preview (shut down).
    const CHAT_MODEL = env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    if (Array.isArray(history) && history.length > 0) {
      for (const m of history) {
        if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })
        }
      }
    }

    contents.push({ role: 'user', parts: [{ text: message.trim() }] })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: NYVEN_SYSTEM_INSTRUCTION }] },
          generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
        }),
      }
    )

    const data = (await geminiRes.json().catch(() => ({}))) as any

    if (!geminiRes.ok) {
      const message = data?.error?.message || `Gemini error (${geminiRes.status})`
      console.error('NYVEN /api/chat Gemini error:', message)
      const mapped = mapGeminiError(geminiRes.status, message)
      return jsonResponse({ success: false, error: mapped.error }, mapped.status)
    }

    const finalText: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''

    if (!finalText.trim()) {
      return jsonResponse(
        { success: false, error: 'NYVEN could not generate a response. Please try again.' },
        500
      )
    }

    return jsonResponse({ success: true, message: finalText.trim() }, 200)
  } catch (err: unknown) {
    console.error('NYVEN /api/chat error:', err)
    return jsonResponse({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }
}
