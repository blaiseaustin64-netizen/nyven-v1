/**
 * Phase 8A — Permission classification helpers.
 *
 * READ / ANALYZE  → normally safe
 * WRITE / EXTERNAL → marked as capable of requiring user approval
 *
 * No approval orchestration is implemented here.
 */

import type { PermissionClass } from './types'

export const PERMISSION_LABELS: Record<PermissionClass, string> = {
  read: 'Read',
  analyze: 'Analyze',
  write: 'Write',
  external: 'External action',
}

export function isReadClass(permission: PermissionClass): boolean {
  return permission === 'read' || permission === 'analyze'
}

export function isWriteClass(permission: PermissionClass): boolean {
  return permission === 'write' || permission === 'external'
}

/**
 * Default policy: write and external always requireApproval in the registry.
 * Callers should still respect CapabilityDefinition.requiresApproval.
 */
export function defaultRequiresApproval(permission: PermissionClass): boolean {
  return isWriteClass(permission)
}

export function permissionClassFromAction(action: string): PermissionClass {
  const a = action.toLowerCase()
  if (
    a.includes('send') ||
    a.includes('forward') ||
    a.includes('publish') ||
    a.includes('deploy')
  ) {
    return 'external'
  }
  if (
    a.includes('create') ||
    a.includes('update') ||
    a.includes('delete') ||
    a.includes('write') ||
    a.includes('modify') ||
    a.includes('archive') ||
    a.includes('label') ||
    a.includes('manage')
  ) {
    return 'write'
  }
  if (a.includes('summarize') || a.includes('categorize') || a.includes('analyze')) {
    return 'analyze'
  }
  return 'read'
}
