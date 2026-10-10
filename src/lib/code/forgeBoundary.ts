/**
 * Integration boundary for VEXDYN Forge. NYVEN Code must not couple to Forge internals.
 * No Forge connection, clone, edit, push, or sync exists yet, so every transfer reports unavailable.
 * When Forge exposes an API and NYVEN has an auth architecture for it, implement the request here.
 */
export type ForgeTransferResult =
  | { available: false; reason: string }
  | { available: true; transferId: string }

export const FORGE_STATUS = {
  connected: false,
  reason:
    'VEXDYN Forge is a separate product and is not connected to NYVEN Code yet. Repository transfer, clone, and sync are not available.',
} as const

export async function requestForgeTransfer(_repo: { owner: string; repo: string }): Promise<ForgeTransferResult> {
  return { available: false, reason: FORGE_STATUS.reason }
}
