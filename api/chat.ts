import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

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

function mapGeminiError(err: unknown): { status: number; error: string } {
  let userMessage = 'Something went wrong. Please try again.'
  let status = 500

  if (err && typeof err === 'object') {
    const anyErr = err as {
      message?: string
      status?: number
      code?: number | string
      statusCode?: number
    }
    const msg = String(anyErr.message || '').toLowerCase()
    const code = Number(anyErr.status || anyErr.statusCode || anyErr.code || 0)

    if (
      code === 429 ||
      msg.includes('quota') ||
      msg.includes('rate') ||
      msg.includes('resource exhausted') ||
      msg.includes('too many requests')
    ) {
      status = 429
      userMessage =
        "NYVEN's AI service is temporarily unavailable because the current model quota has been reached. Please try again later."
    } else if (
      code === 401 ||
      code === 403 ||
      msg.includes('api key') ||
      msg.includes('permission') ||
      msg.includes('unauthenticated') ||
      msg.includes('unauthorized')
    ) {
      status = 503
      userMessage = 'NYVEN is temporarily unavailable. Please try again later.'
    } else if (
      code >= 500 ||
      msg.includes('unavailable') ||
      msg.includes('internal') ||
      msg.includes('deadline') ||
      msg.includes('timeout')
    ) {
      status = 503
      userMessage = 'NYVEN is temporarily unavailable. Please try again in a moment.'
    } else if (msg.includes('safety') || msg.includes('blocked') || msg.includes('prohibited')) {
      status = 400
      userMessage = 'I cannot respond to that request. Please try a different question.'
    }
  }

  return { status, error: userMessage }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { message, history } = req.body as {
      message?: string
      history?: ChatMessage[]
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured')
      return res.status(500).json({
        success: false,
        error: 'NYVEN is temporarily unavailable. Please try again later.',
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    // Chat model is intentionally separate from Builder.
    // Default: gemini-3.1-flash-lite (stable). Optional override: GEMINI_CHAT_MODEL.
    // Do not use gemini-3.1-flash-lite-preview (shut down).
    const CHAT_MODEL =
      process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite'

    // Build multi-turn contents from conversation history + new message
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    if (Array.isArray(history) && history.length > 0) {
      for (const m of history) {
        if (
          m &&
          typeof m.content === 'string' &&
          (m.role === 'user' || m.role === 'assistant')
        ) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    })

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents,
      config: {
        systemInstruction: NYVEN_SYSTEM_INSTRUCTION,
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    })

    const finalText = (response.text || '').trim()

    if (!finalText) {
      return res.status(500).json({
        success: false,
        error: 'NYVEN could not generate a response. Please try again.',
      })
    }

    return res.status(200).json({
      success: true,
      message: finalText,
    })
  } catch (err: unknown) {
    console.error('NYVEN /api/chat error:', err)
    const mapped = mapGeminiError(err)
    return res.status(mapped.status).json({
      success: false,
      error: mapped.error,
    })
  }
      }
