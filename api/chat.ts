import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

const NYVEN_SYSTEM_INSTRUCTION = `You are NYVEN.

Tagline: Intelligence, built for what's next.

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
You never describe yourself as Gemini, Google, or any underlying model.
The user is interacting with NYVEN.

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  return undefined
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

    // Current official Google GenAI SDK
    const ai = new GoogleGenAI({ apiKey })

    // Centralized model config — change via GEMINI_MODEL env var if needed
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

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

    // Current user message
    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    })

    // Retry on transient Gemini overload (503) — up to 2 retries with short backoff
    const MAX_ATTEMPTS = 3
    let lastErr: unknown = null
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: NYVEN_SYSTEM_INSTRUCTION,
            maxOutputTokens: 2048,
            temperature: 0.7,
          },
        })
        lastErr = null
        break
      } catch (err: unknown) {
        lastErr = err
        const status = getStatus(err)
        const isRetryable = status === 503 || status === 429

        console.error(
          `NYVEN /api/chat attempt ${attempt}/${MAX_ATTEMPTS} failed`,
          status ? `status=${status}` : '',
          err
        )

        if (!isRetryable || attempt === MAX_ATTEMPTS) {
          throw err
        }

        await sleep(attempt * 600) // 600ms, then 1200ms
      }
    }

    if (!response) {
      throw lastErr ?? new Error('No response from Gemini after retries')
    }

    // response.text is the standard property in @google/genai
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

    const status = getStatus(err)
    let userMessage = 'Something went wrong. Please try again.'

    if (status === 503) {
      userMessage = 'NYVEN is warming up right now. Please try again in a moment.'
    } else if (err && typeof err === 'object' && 'message' in err) {
      const msg = String((err as { message: string }).message).toLowerCase()
      if (msg.includes('api key') || msg.includes('invalid') || msg.includes('permission')) {
        userMessage = 'NYVEN is temporarily unavailable. Please try again later.'
      } else if (msg.includes('quota') || msg.includes('rate') || msg.includes('resource')) {
        userMessage =
          'NYVEN is receiving many requests right now. Please wait a moment and try again.'
      } else if (msg.includes('safety') || msg.includes('blocked') || msg.includes('prohibited')) {
        userMessage = 'I cannot respond to that request. Please try a different question.'
      }
    }

    return res.status(500).json({
      success: false,
      error: userMessage,
    })
  }
}
