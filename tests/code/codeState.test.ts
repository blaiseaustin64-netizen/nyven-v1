import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQuery,
  callbackReasonMessage,
  deriveConnectionView,
  filterRepos,
  formatBytes,
  GENERIC_STATUS_ERROR,
  messageForCode,
  parentPath,
  requiresReconnect,
  splitPath,
} from '../../src/lib/code/codeState.ts'

const base = { authLoading: false, supabaseConfigured: true, signedIn: true, status: null as null | Record<string, unknown>, statusError: null as string | null }

describe('deriveConnectionView: the UI reflects real server status only', () => {
  test('shows loading while auth resolves', () => {
    assert.deepEqual(deriveConnectionView({ ...base, authLoading: true }), { kind: 'loading' })
  })

  test('sign-in is required when signed out (status is never requested)', () => {
    assert.deepEqual(deriveConnectionView({ ...base, signedIn: false, status: { success: true, connected: true } }), { kind: 'signed_out' })
  })

  test('auth not configured is reported as unavailable, not as disconnected', () => {
    assert.equal(deriveConnectionView({ ...base, supabaseConfigured: false }).kind, 'auth_unavailable')
  })

  test('no status yet is loading, never connected', () => {
    assert.deepEqual(deriveConnectionView(base), { kind: 'loading' })
  })

  test('a connected server status yields connected with the account label', () => {
    const v = deriveConnectionView({
      ...base,
      status: { success: true, configured: true, connected: true, connection: { account_label: 'octocat', connected_at: 't', scopes: ['repo'] } },
    })
    assert.deepEqual(v, { kind: 'connected', account: 'octocat', connectedAt: 't', scopes: ['repo'] })
  })

  test('a disconnected server status is disconnected, not connected', () => {
    assert.deepEqual(deriveConnectionView({ ...base, status: { success: true, configured: true, connected: false, connection: null } }), { kind: 'disconnected' })
  })

  test('a CONFIG response is unconfigured (never ready-to-connect)', () => {
    const v = deriveConnectionView({ ...base, status: { success: false, code: 'CONFIG', configured: false, connected: false } })
    assert.equal(v.kind, 'unconfigured')
  })

  test('a DB_READ response is unavailable, never disconnected', () => {
    const v = deriveConnectionView({ ...base, status: { success: false, code: 'DB_READ', error: 'Could not read GitHub connection state.' } })
    assert.deepEqual(v, { kind: 'unavailable', message: 'Could not read GitHub connection state.' })
  })

  test('a network failure to the status route is unavailable with the generic message', () => {
    assert.deepEqual(deriveConnectionView({ ...base, statusError: GENERIC_STATUS_ERROR }), { kind: 'unavailable', message: GENERIC_STATUS_ERROR })
  })

  test('the same inputs always produce the same view (Settings and NYVEN Code agree)', () => {
    const input = { ...base, status: { success: true, configured: true, connected: true, connection: { account_label: 'a' } } }
    assert.deepEqual(deriveConnectionView(input), deriveConnectionView({ ...input }))
  })
})

describe('error copy and reconnect decisions', () => {
  test('known codes map to specific, truthful messages', () => {
    assert.match(messageForCode('NOT_CONNECTED'), /not connected/i)
    assert.match(messageForCode('GITHUB_RATE_LIMIT'), /rate limit/i)
    assert.match(messageForCode('DB_READ'), /could not read/i)
  })

  test('unknown codes fall back to the supplied message, then a generic one', () => {
    assert.equal(messageForCode('WHO_KNOWS', 'custom'), 'custom')
    assert.equal(messageForCode(undefined), 'Something went wrong. Try again.')
  })

  test('only auth-related codes ask the user to reconnect', () => {
    assert.equal(requiresReconnect('NOT_CONNECTED'), true)
    assert.equal(requiresReconnect('GITHUB_AUTH'), true)
    assert.equal(requiresReconnect('DECRYPT'), true)
    assert.equal(requiresReconnect('DB_READ'), false)
    assert.equal(requiresReconnect('GITHUB_RATE_LIMIT'), false)
  })

  test('OAuth callback failure reasons map to copy and never claim success', () => {
    assert.match(callbackReasonMessage('denied'), /cancelled/i)
    assert.match(callbackReasonMessage('state_mismatch'), /could not be verified/i)
    assert.match(callbackReasonMessage('unknown_reason'), /did not complete/i)
    assert.match(callbackReasonMessage(null), /did not complete/i)
  })
})

describe('repository search', () => {
  const repos = [
    { full_name: 'octocat/Hello-World', description: 'first repo' },
    { full_name: 'octocat/nyven', description: 'Code workspace' },
    { full_name: 'other/tools', description: null },
  ]

  test('empty query keeps every loaded repository', () => {
    assert.equal(filterRepos(repos, '   ').length, 3)
  })

  test('matches name case-insensitively', () => {
    assert.deepEqual(filterRepos(repos, 'HELLO').map((r) => r.full_name), ['octocat/Hello-World'])
  })

  test('matches description text', () => {
    assert.deepEqual(filterRepos(repos, 'workspace').map((r) => r.full_name), ['octocat/nyven'])
  })

  test('no match returns an empty list rather than fabricated results', () => {
    assert.deepEqual(filterRepos(repos, 'zzz'), [])
  })
})

describe('path navigation', () => {
  test('splitPath produces a root crumb plus one crumb per segment', () => {
    assert.deepEqual(splitPath('src/app'), [
      { name: '/', path: '' },
      { name: 'src', path: 'src' },
      { name: 'app', path: 'src/app' },
    ])
  })

  test('splitPath for the root is just the root crumb', () => {
    assert.deepEqual(splitPath(''), [{ name: '/', path: '' }])
  })

  test('parentPath walks up one level and stops at the root', () => {
    assert.equal(parentPath('src/app/lib'), 'src/app')
    assert.equal(parentPath('src'), '')
    assert.equal(parentPath(''), '')
  })
})

describe('formatting and query building', () => {
  test('formatBytes uses B, KB and MB and rejects invalid input', () => {
    assert.equal(formatBytes(512), '512 B')
    assert.equal(formatBytes(2048), '2.0 KB')
    assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB')
    assert.equal(formatBytes(-1), '—')
  })

  test('buildQuery drops empty values and encodes the rest', () => {
    assert.equal(buildQuery({ owner: 'octo', repo: 'a b', ref: undefined, path: '', page: 2 }), 'owner=octo&repo=a+b&page=2')
  })
})
