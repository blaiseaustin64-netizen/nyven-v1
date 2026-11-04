# NYVEN launch fix — Gemini model + STT/TTS configuration

## Issue 1 — Gemini model
- **Root cause:** Default `gemini-2.0-flash` is retired / unavailable for many API keys.
- **Fix:** Default chat model is now `gemini-3.5-flash-lite` (lightweight, currently supported).
- Automatic fallbacks on model-not-found: `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-2.5-flash-lite`.
- Env `GEMINI_CHAT_MODEL` still overrides when set (strip accidental `models/` prefix).
- **Builder model unchanged** (`OPENROUTER_BUILDER_MODEL` / DeepSeek).

## Issue 2 — STT (STT_UNAVAILABLE)
- **Root cause:** Server has neither Workers AI binding `AI` nor `GROQ_API_KEY`.
- Code path is correct: Cloudflare Whisper primary, Groq fallback.
- **Fix:** Enabled `[ai] binding = "AI"` in `wrangler.toml`.
- **You must also** in Cloudflare Pages dashboard → Settings → Functions →
  Workers AI bindings → add binding name **`AI`** (Production + Preview), then redeploy.

## Issue 3 — TTS
- Implementation already uses OpenRouter + Fish Audio `fish-audio/s2.1-pro-free:free`.
- Voices **unchanged**: Sarah, ALEX J, Adrian (existing Fish IDs).
- **Requires** Production secret `OPENROUTER_API_KEY`. Optional:
  - `OPENROUTER_TTS_MODEL=fish-audio/s2.1-pro-free:free`
  - `OPENROUTER_TTS_VOICE=933563129e564b19a115bedd57b7406a` (Sarah default)

## Cloudflare checklist
1. `GEMINI_CHAT_MODEL=gemini-3.5-flash-lite` (or leave unset to use code default)
2. Workers AI binding **`AI`**
3. Optional `GROQ_API_KEY` for STT fallback
4. `OPENROUTER_API_KEY` for TTS
5. Redeploy after binding/env changes
6. Check `/api/health` → `sttConfigured`, `ttsConfigured`, `workersAiBound`
