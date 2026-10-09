/**
 * NYVEN voice catalog — Sarah, ALEX J, Adrian (Fish Audio via OpenRouter).
 * Single source of truth for IDs, labels, preview scripts, and orb palettes.
 */

export type VoiceCatalogId = 'sarah' | 'alex-j' | 'adrian'

/** RGB triple for Claude liquid-orb gradients */
export type OrbRgb = [number, number, number]

export type VoiceOrbPalette = {
  /** Calm / thinking base gradient (voice identity) */
  calm: { a: OrbRgb; b: OrbRgb }
}

export type VoiceCatalogEntry = {
  id: VoiceCatalogId
  displayName: string
  /** Fish Audio reference / model id for OpenRouter `voice` field */
  fishVoiceId: string
  description: string
  previewSentence: string
  palette: VoiceOrbPalette
  isDefault?: boolean
}

/** Official Sarah — default NYVEN voice (Claude blue→purple) */
export const SARAH_FISH_ID = '933563129e564b19a115bedd57b7406a'
/** ALEX J — https://fish.audio/m/2a9605eeafe84974b5b20628d42c0060/ */
export const ALEX_J_FISH_ID = '2a9605eeafe84974b5b20628d42c0060'
/** Adrian — https://fish.audio/m/bf322df2096a46f18c579d0baa36f41d/ */
export const ADRIAN_FISH_ID = 'bf322df2096a46f18c579d0baa36f41d'

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: 'sarah',
    displayName: 'Sarah',
    fishVoiceId: SARAH_FISH_ID,
    description: 'Warm, natural, and professional.',
    previewSentence:
      "Great ideas begin with curiosity. Let's explore what's possible.",
    palette: {
      // Original Claude calm: blue → purple
      calm: { a: [20, 89, 255], b: [179, 31, 242] },
    },
    isDefault: true,
  },
  {
    id: 'alex-j',
    displayName: 'ALEX J',
    fishVoiceId: ALEX_J_FISH_ID,
    description: 'A young female voice with a calm, reflective tone.',
    previewSentence:
      'Take a breath, find clarity, and discover a new perspective.',
    palette: {
      // Calm teal → soft indigo
      calm: { a: [32, 140, 168], b: [88, 72, 196] },
    },
  },
  {
    id: 'adrian',
    displayName: 'Adrian',
    fishVoiceId: ADRIAN_FISH_ID,
    description: 'Confident, polished, and refined.',
    previewSentence:
      'Think clearly. Act decisively. Turn your vision into results.',
    palette: {
      // Navy → warm amber
      calm: { a: [28, 58, 128], b: [196, 128, 48] },
    },
  },
]

const byFishId = new Map(VOICE_CATALOG.map((v) => [v.fishVoiceId, v]))
const byId = new Map(VOICE_CATALOG.map((v) => [v.id, v]))

export function getDefaultVoice(): VoiceCatalogEntry {
  return VOICE_CATALOG.find((v) => v.isDefault) || VOICE_CATALOG[0]
}

export function getVoiceByFishId(fishId: string | null | undefined): VoiceCatalogEntry | null {
  if (!fishId) return null
  return byFishId.get(fishId) || null
}

export function getVoiceById(id: VoiceCatalogId | string): VoiceCatalogEntry | null {
  return byId.get(id as VoiceCatalogId) || null
}

/** Allowlist for server + client — never accept arbitrary Fish IDs from the client */
export function isAllowedFishVoiceId(fishId: string | null | undefined): boolean {
  if (!fishId) return false
  return byFishId.has(fishId)
}

export function resolveFishVoiceId(raw: string | null | undefined): string {
  const found = getVoiceByFishId(raw || '')
  if (found) return found.fishVoiceId
  // Legacy Sua id → Sarah
  if (raw === 'de77377323004b48937473a795d86f1f' || (raw || '').toLowerCase() === 'sua') {
    return SARAH_FISH_ID
  }
  return getDefaultVoice().fishVoiceId
}
