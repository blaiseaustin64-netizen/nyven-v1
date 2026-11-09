import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  Sparkles,
  Mic,
  Shield,
  BarChart3,
  Monitor,
  Bug,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type NyvenPreferences,
} from '../lib/settings/preferences'
import { fetchUsageSummary, type UsageSummary } from '../lib/settings/usageSummary'
import {
  listMemories,
  deleteMemory,
  setMemoryEnabled,
} from '../lib/memoryStore'
import type { MemoryItem } from '../lib/memoryStore'
import { setVoicePreferences } from '../lib/voice/preferences'
import { VoiceSpeechSettings } from '../components/voice/VoiceSpeechSettings'
import { resolveFishVoiceId } from '../lib/voice/catalog'

type Section =
  | 'account'
  | 'ai'
  | 'voice'
  | 'privacy'
  | 'usage'
  | 'sessions'
  | 'support'

const sections: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'sessions', label: 'Sessions', icon: Monitor },
  { id: 'support', label: 'Report a Bug', icon: Bug },
]

function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-nyven-surface border border-nyven-cyan/30 text-sm text-nyven-cyan shadow-lg">
      {message}
    </div>
  )
}

export function Settings() {
  const { user, profile, configured, loading: authLoading, signOut, refreshProfile } =
    useAuth()
  const userId = user?.id ?? null
  const [params, setParams] = useSearchParams()
  const routeParams = useParams<{ section?: string }>()
  const navigate = useNavigate()
  const rawSection = (routeParams.section || params.get('section') || 'account') as string
  // Connected services temporarily removed — redirect old links to account.
  const active = (rawSection === 'connections' ? 'account' : rawSection) as Section
  const setActive = (s: Section) => {
    // Prefer path segments so mobile Back works
    navigate(`/settings/${s}`)
    setParams({ section: s }, { replace: true })
  }
  const showMobileList = !routeParams.section && !params.get('section')

  const [prefs, setPrefs] = useState<NyvenPreferences>(DEFAULT_PREFERENCES)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => {
    let cancelled = false
    setPrefsLoading(true)
    void loadPreferences(userId).then((p) => {
      if (!cancelled) {
        setPrefs(p)
        setPrefsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    setDisplayName(profile?.display_name || '')
  }, [profile])

  useEffect(() => {
    if (active === 'usage') {
      void fetchUsageSummary(userId).then(setUsage)
    }
    if (active === 'privacy' && userId) {
      void listMemories(userId, { includeDisabled: true }).then(setMemories)
    }
  }, [active, userId])

  const persistPrefs = useCallback(
    async (next: NyvenPreferences) => {
      setPrefs(next)
      setSaving(true)
      const res = await savePreferences(userId, next)
      // Keep voice controller prefs in sync
      setVoicePreferences({
        enabled: next.voice.voiceEnabled,
        autoSpeak: next.voice.autoSpeak,
        voiceId: next.voice.voiceId,
      })
      setSaving(false)
      if (!res.ok) showToast(res.error || 'Could not save')
      else showToast('Saved')
    },
    [userId]
  )

  const saveProfile = async () => {
    if (!userId) return
    const name = displayName.trim()
    if (!name) { showToast('Display name cannot be empty'); return }
    if (name.length > 80) { showToast('Display name must be at most 80 characters'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ displayName: name }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) showToast(data.error || 'Could not update profile')
      else { await refreshProfile(); showToast('Profile updated') }
    } catch { showToast('Could not update profile') }
    finally { setSaving(false) }
  }

  const changePassword = async () => {
    if (!user) return
    if (password.length < 8) {
      showToast('Password must be at least 8 characters')
      return
    }
    if (password !== password2) {
      showToast('Passwords do not match')
      return
    }
    showToast('Use Forgot password on the sign-in page to reset your password securely by email.')
    setPassword('')
    setPassword2('')
  }

  const clearGuestHistory = () => {
    try {
      localStorage.removeItem('nyven_chat_history_v1')
      showToast('Local chat history cleared')
    } catch {
      showToast('Could not clear local history')
    }
  }

  const requestAccountDelete = async () => {
    if (deleteConfirm !== 'DELETE') { showToast('Type DELETE to confirm'); return }
    if (!deletePassword) { showToast('Enter your current password'); return }
    setDeletingAccount(true)
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ password: deletePassword, confirmation: 'DELETE' }),
      })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) { showToast(data.error || 'Could not delete account'); return }
      try {
        const keys = [
          userId ? `nyven_chat_history_v1:user:${userId}` : null,
          'nyven_chat_history_v1', 'nyven_pinned_chats_v1', 'nyven_chat_projects_v1',
          'nyven_builder_projects_v1', 'nyven_sync_queue_v1', 'nyven_pending_deletes_v1',
        ].filter(Boolean) as string[]
        for (const k of keys) localStorage.removeItem(k)
        try { sessionStorage.removeItem('nyven_builder_projects_v1') } catch { /* */ }
      } catch { /* */ }
      await signOut()
      window.location.href = '/auth?deleted=1'
    } catch { showToast('Could not delete account') }
    finally { setDeletingAccount(false) }
  }

  const sectionMeta: Record<Section, { label: string; hint: string }> = {
    account: { label: 'Account', hint: 'Profile and sign-in' },
    ai: { label: 'AI', hint: 'Response style and memory' },
    voice: { label: 'Voice', hint: 'Speech and voice options' },
    privacy: { label: 'Privacy & Security', hint: 'Memories and data' },
    usage: { label: 'Usage', hint: 'Limits and daily allowance' },
    sessions: { label: 'Sessions', hint: 'This device' },
    support: { label: 'Report a Bug', hint: 'Send feedback to the team' },
  }

  const mobileGroups: { title: string; ids: Section[] }[] = [
    { title: 'You', ids: ['account'] },
    { title: 'Experience', ids: ['ai', 'voice'] },
    { title: 'Data', ids: ['privacy', 'usage', 'sessions'] },
    { title: 'Help', ids: ['support'] },
  ]

  const sectionNav = (
    <nav className="hidden lg:flex lg:w-52 shrink-0 flex-col gap-1">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActive(id)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors min-h-[44px] ${
            active === id
              ? 'bg-nyven-surface text-nyven-cyan'
              : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03]'
          }`}
        >
          <Icon size={16} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </nav>
  )

  const initial =
    (profile?.display_name || user?.displayName || user?.email || '?')
      .trim()
      .charAt(0)
      .toUpperCase() || '?'

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center gap-3 mb-6 lg:mb-8">
          <Link
            to={routeParams.section || params.get('section') ? '/settings' : '/chat'}
            className="lg:hidden p-2 rounded-xl hover:bg-white/[0.04] text-nyven-text-secondary min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-medium">
            {routeParams.section || params.get('section')
              ? sectionMeta[active]?.label || 'Settings'
              : 'Settings'}
          </h1>
          {saving && (
            <Loader2 size={16} className="animate-spin text-nyven-text-secondary" />
          )}
        </div>

        {/* Mobile: vertical settings list */}
        <div className={`lg:hidden space-y-5 ${showMobileList ? 'block' : 'hidden'}`}>
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.08] bg-nyven-surface/80">
            <div className="w-12 h-12 rounded-full bg-nyven-cyan/15 text-nyven-cyan flex items-center justify-center text-lg font-semibold shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium text-nyven-text truncate">
                {profile?.display_name || user?.displayName || 'Guest'}
              </p>
              <p className="text-sm text-nyven-text-secondary truncate">
                {user?.email || 'Not signed in'}
              </p>
            </div>
            <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 text-nyven-text-secondary shrink-0">
              Free
            </span>
          </div>

          {mobileGroups.map((g) => (
            <div key={g.title}>
              <p className="text-xs uppercase tracking-wide text-nyven-text-secondary/80 px-1 mb-2">
                {g.title}
              </p>
              <div className="rounded-2xl border border-white/[0.08] bg-nyven-surface/60 overflow-hidden divide-y divide-white/[0.05]">
                {g.ids.map((id) => {
                  const Icon = sections.find((s) => s.id === id)!.icon
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActive(id)}
                      className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-nyven-cyan/10"
                    >
                      <span className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-nyven-text-secondary shrink-0">
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[16px] text-nyven-text">{sectionMeta[id].label}</span>
                        <span className="block text-xs text-nyven-text-secondary truncate">
                          {sectionMeta[id].hint}
                        </span>
                      </span>
                      <ChevronLeft size={18} className="rotate-180 text-nyven-text-secondary/50 shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full min-h-[56px] rounded-2xl border border-red-400/20 text-red-300 text-[16px] font-medium active:bg-red-400/10"
          >
            Sign out
          </button>
        </div>

        <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8 min-w-0 ${showMobileList ? 'hidden lg:flex' : 'flex'}`}>
          {sectionNav}

          <motion.div
            key={active}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0 space-y-6"
          >
            {prefsLoading && (
              <p className="text-sm text-nyven-text-secondary">Loading preferences…</p>
            )}

            {/* ── Account ── */}
            {active === 'account' && (
              <>
                <SectionTitle title="Account" desc="Profile and sign-in." />
                {!configured && (
                  <Card>
                    <p className="text-sm text-nyven-text-secondary">
                      Sign-in is handled by NYVEN authentication.
                      If accounts seem unavailable, check that the app is deployed with
                      account services configured.
                    </p>
                  </Card>
                )}
                {configured && authLoading && (
                  <p className="text-sm text-nyven-text-secondary">Checking session…</p>
                )}
                {configured && !authLoading && !user && (
                  <Card>
                    <p className="text-sm text-nyven-text-secondary mb-3">
                      You are browsing as a guest. Sign in to sync profile and history.
                    </p>
                    <Link
                      to="/auth"
                      className="inline-flex px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
                    >
                      Sign in / Sign up
                    </Link>
                  </Card>
                )}
                {configured && user && (
                  <>
                    <Card>
                      <Field label="Email">
                        <span className="text-sm">{user.email}</span>
                      </Field>
                      <Field label="Display name">
                        <input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => void saveProfile()}
                        className="mt-2 px-4 py-2 rounded-xl bg-nyven-surface border border-white/[0.08] text-sm hover:bg-white/[0.04]"
                      >
                        Save profile
                      </button>
                    </Card>
                    <Card>
                      <h3 className="text-sm font-medium mb-3">Change password</h3>
                      <Field label="New password">
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <Field label="Confirm">
                        <input
                          type="password"
                          value={password2}
                          onChange={(e) => setPassword2(e.target.value)}
                          className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => void changePassword()}
                        className="mt-2 px-4 py-2 rounded-xl text-sm border border-white/[0.08] hover:bg-white/[0.04]"
                      >
                        Update password
                      </button>
                    </Card>
                    <Card>
                      <h3 className="text-sm font-medium mb-2 text-red-300/90">Delete account</h3>
                      <p className="text-xs text-nyven-text-secondary mb-3">
                        Permanently deletes your account, chats, connections, and projects.
                        Enter your password and type DELETE to confirm.
                      </p>
                      <Field label="Current password">
                        <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                          className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400/40"
                          autoComplete="current-password" />
                      </Field>
                      <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Type DELETE"
                        className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm mb-2 mt-2 outline-none" />
                      <button type="button" disabled={deletingAccount} onClick={() => void requestAccountDelete()}
                        className="text-sm text-red-400/90 hover:text-red-400 disabled:opacity-50">
                        {deletingAccount ? 'Deleting…' : 'Delete my account'}
                      </button>
                    </Card>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="text-sm text-nyven-text-secondary hover:text-nyven-text"
                    >
                      Sign out
                    </button>
                  </>
                )}
              </>
            )}

            {/* ── AI ── */}
            {active === 'ai' && (
              <>
                <SectionTitle
                  title="AI preferences"
                  desc="Response style and tool behavior. Model keys stay on the server."
                />
                <Card>
                  <Field label="Response style">
                    <Select
                      value={prefs.ai.responseStyle}
                      onChange={(v) =>
                        void persistPrefs({
                          ...prefs,
                          ai: {
                            ...prefs.ai,
                            responseStyle: v as AIPreferences['responseStyle'],
                          },
                        })
                      }
                      options={[
                        { value: 'concise', label: 'Concise' },
                        { value: 'balanced', label: 'Balanced' },
                        { value: 'detailed', label: 'Detailed' },
                      ]}
                    />
                  </Field>
                  <Field label="Memory">
                    <Toggle
                      on={prefs.ai.memoryEnabled}
                      onChange={(on) =>
                        void persistPrefs({
                          ...prefs,
                          ai: { ...prefs.ai, memoryEnabled: on },
                        })
                      }
                      label={prefs.ai.memoryEnabled ? 'Enabled' : 'Disabled'}
                    />
                  </Field>
                  <Field label="Web search preference">
                    <Select
                      value={prefs.ai.webSearchPreference}
                      onChange={(v) =>
                        void persistPrefs({
                          ...prefs,
                          ai: {
                            ...prefs.ai,
                            webSearchPreference: v as AIPreferences['webSearchPreference'],
                          },
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Automatic (model decides)' },
                        { value: 'prefer_on', label: 'Prefer searching when useful' },
                        { value: 'prefer_off', label: 'Prefer answering without search' },
                      ]}
                    />
                  </Field>
                  <p className="text-xs text-nyven-text-secondary mt-2">
                    Chat model selection is managed for you. Preferences do not
                    change model routing from the browser.
                  </p>
                </Card>
              </>
            )}

            {/* ── Voice ── */}
            {active === 'voice' && (
              <>
                <SectionTitle
                  title="Voice & Speech"
                  desc="Choose how Nyven sounds."
                />
                <Card>
                  <VoiceSpeechSettings
                    voiceId={resolveFishVoiceId(prefs.voice.voiceId)}
                    voiceEnabled={prefs.voice.voiceEnabled}
                    autoSpeak={prefs.voice.autoSpeak}
                    onChangeVoiceId={(id) =>
                      setPrefs((p) => ({
                        ...p,
                        voice: { ...p.voice, voiceId: id },
                      }))
                    }
                    onToggleEnabled={(on) =>
                      void persistPrefs({
                        ...prefs,
                        voice: { ...prefs.voice, voiceEnabled: on },
                      })
                    }
                    onToggleAutoSpeak={(on) =>
                      void persistPrefs({
                        ...prefs,
                        voice: { ...prefs.voice, autoSpeak: on },
                      })
                    }
                    onSave={async (fishVoiceId) => {
                      const id = resolveFishVoiceId(fishVoiceId)
                      await persistPrefs({
                        ...prefs,
                        voice: {
                          ...prefs.voice,
                          voiceId: id,
                        },
                      })
                      setVoicePreferences({
                        voiceId: id,
                        enabled: prefs.voice.voiceEnabled,
                        autoSpeak: prefs.voice.autoSpeak,
                      })
                    }}
                    saving={saving}
                  />
                </Card>
              </>
            )}

            {/* ── Privacy ── */}
            {active === 'privacy' && (
              <>
                <SectionTitle
                  title="Privacy & Security"
                  desc="What NYVEN stores and how you control it."
                />
                <Card>
                  <h3 className="text-sm font-medium mb-2">Data NYVEN may store</h3>
                  <ul className="text-xs text-nyven-text-secondary space-y-1 list-disc pl-4">
                    <li>Conversations and messages (account or local guest storage)</li>
                    <li>Selective memories you enable</li>
                    <li>Usage events (messages, voice, tools) for signed-in users</li>
                    <li>Profile display name and preferences</li>
                    <li>Connected service metadata (when OAuth is implemented)</li>
                  </ul>
                  <p className="text-xs text-nyven-text-secondary mt-3">
                    Provider API keys and OAuth secrets are never stored in the browser.
                  </p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium mb-3">Memories</h3>
                  {!userId && (
                    <p className="text-sm text-nyven-text-secondary">
                      Sign in to manage durable memories.
                    </p>
                  )}
                  {userId && memories.length === 0 && (
                    <p className="text-sm text-nyven-text-secondary">No memories stored.</p>
                  )}
                  {userId &&
                    memories.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start gap-2 py-2 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{m.content}</p>
                          <p className="text-xs text-nyven-text-secondary">{m.memory_type}</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-nyven-text-secondary hover:text-nyven-cyan"
                          onClick={() =>
                            void setMemoryEnabled(userId, m.id, !m.enabled).then(() =>
                              listMemories(userId, { includeDisabled: true }).then(setMemories)
                            )
                          }
                        >
                          {m.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400/80"
                          onClick={() =>
                            void deleteMemory(userId, m.id).then(() =>
                              listMemories(userId, { includeDisabled: true }).then(setMemories)
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </Card>
                <Card>
                  <h3 className="text-sm font-medium mb-2">Support</h3>
                  <p className="text-xs text-nyven-text-secondary mb-2">
                    Use Report a bug from Chat (bug icon). Submissions go to the NYVEN
                    backend — not mailto or client email.
                  </p>
                </Card>
                <Card>
                  <h3 className="text-sm font-medium mb-2">Chat history</h3>
                  {!userId && (
                    <button
                      type="button"
                      onClick={clearGuestHistory}
                      className="text-sm text-nyven-cyan hover:underline"
                    >
                      Clear local guest history
                    </button>
                  )}
                  {userId && (
                    <p className="text-sm text-nyven-text-secondary">
                      Delete individual chats from the chat history panel. Account data is
                      stored securely with access checks on your account.
                    </p>
                  )}
                </Card>
              </>
            )}

            {/* ── Usage ── */}
            {active === 'usage' && (
              <>
                <SectionTitle
                  title="Usage"
                  desc="Daily usage limits for your account."
                />
                {!usage && (
                  <p className="text-sm text-nyven-text-secondary">Loading…</p>
                )}
                {usage && !usage.available && (
                  <Card>
                    <p className="text-sm text-nyven-text-secondary">
                      {usage.error || 'Usage data unavailable.'}
                    </p>
                  </Card>
                )}
                {usage?.available && (
                  <Card>
                    {usage.source === 'd1' ? (
                      <>
                        <UsageRow
                          label="Chat messages today"
                          value={`${usage.message} / ${usage.chatLimit ?? '—'}`}
                        />
                        <UsageRow
                          label="Chat remaining"
                          value={String(usage.chatRemaining ?? '—')}
                        />
                        <UsageRow
                          label="Voice used (seconds)"
                          value={`${usage.voice_stt} / ${usage.voiceLimitSeconds ?? '—'}`}
                        />
                        <UsageRow
                          label="Voice remaining (seconds)"
                          value={String(usage.voiceRemainingSeconds ?? '—')}
                        />
                        <UsageRow
                          label="Max voice session"
                          value={`${usage.maxSessionSeconds ?? 300}s`}
                        />
                        <p className="text-xs text-nyven-text-secondary mt-3">
                          Daily window: {usage.since} ({usage.timezone || 'UTC'}). Resets{' '}
                          {usage.resetsAt
                            ? new Date(usage.resetsAt).toLocaleString()
                            : 'end of UTC day'}
                          .
                        </p>
                      </>
                    ) : (
                      <>
                        <UsageRow label="Messages" value={usage.message} />
                        <UsageRow label="Voice (STT)" value={usage.voice_stt} />
                        <UsageRow label="Voice (TTS)" value={usage.voice_tts} />
                        <UsageRow label="Attachments" value={usage.attachment} />
                        <UsageRow label="Web searches" value={usage.web_search} />
                        <UsageRow label="Tool calls" value={usage.tool_call} />
                        <p className="text-xs text-nyven-text-secondary mt-3">
                          Since {usage.since ? new Date(usage.since).toLocaleDateString() : '—'}
                        </p>
                      </>
                    )}
                  </Card>
                )}
              </>
            )}

            {/* ── Sessions ── */}
            {active === 'sessions' && (
              <>
                <SectionTitle
                  title="Sessions"
                  desc="Signed-in session for this browser."
                />
                <Card>
                  {!user && (
                    <p className="text-sm text-nyven-text-secondary">
                      No signed-in session. Device lists beyond the current session require
                      additional Auth admin APIs and are not invented here.
                    </p>
                  )}
                  {user && (
                    <>
                      <Field label="Current user">
                        <span className="text-sm truncate">{user.email}</span>
                      </Field>
                      <Field label="User id">
                        <span className="text-xs font-mono text-nyven-text-secondary break-all">
                          {user.id}
                        </span>
                      </Field>
                      <button
                        type="button"
                        onClick={() => void signOut()}
                        className="mt-2 px-4 py-2 rounded-xl text-sm border border-white/[0.08] hover:bg-white/[0.04]"
                      >
                        Sign out this device
                      </button>
                      <p className="text-xs text-nyven-text-secondary mt-3">
                        Sign out clears this device session. Other devices keep their sessions until they expire or you sign out there.
                        or a dedicated server endpoint — not simulated with fake device
                        rows.
                      </p>
                    </>
                  )}
                </Card>
              </>
            )}

            {active === 'support' && (
              <>
                <SectionTitle
                  title="Report a Bug"
                  desc="Tell us what went wrong. Reports go to the NYVEN bug endpoint."
                />
                <BugReportCard />
              </>
            )}

          </motion.div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  )
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="font-medium text-lg">{title}</h2>
      <p className="text-sm text-nyven-text-secondary mt-1">{desc}</p>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-4 space-y-3">
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-nyven-text-secondary mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center gap-3 text-sm"
    >
      <span
        className={`relative w-10 h-6 rounded-full transition-colors ${
          on ? 'bg-nyven-cyan/40' : 'bg-white/[0.08]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            on ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
      {label}
    </button>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function UsageRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-nyven-text-secondary">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

type AIPreferences = NyvenPreferences['ai']


function BugReportCard() {
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('general')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (summary.trim().length < 5) {
      setError('Please describe what went wrong (at least a few words).')
      return
    }
    setBusy(true)
    try {
      // Session is HttpOnly cookie (nyven_session); browser sends it with credentials.
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary.trim(),
          category,
          details: details.trim(),
          route: typeof window !== 'undefined' ? window.location.pathname : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          clientVersion: '1.0.0',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not submit report.')
        return
      }
      setDone(true)
      setSummary('')
      setDetails('')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Card>
        <p className="text-sm text-nyven-cyan">Thank you — your report was submitted.</p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-sm text-nyven-text-secondary hover:text-nyven-text underline"
        >
          Submit another
        </button>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label="What happened?">
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/30 min-h-[44px]"
            placeholder="Brief summary"
            maxLength={500}
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none min-h-[44px]"
          >
            <option value="general">General</option>
            <option value="chat">Chat</option>
            <option value="voice">Voice</option>
            <option value="agents">Agents</option>
            <option value="auth">Sign-in / account</option>
            <option value="ui">Interface</option>
          </select>
        </Field>
        <Field label="Details (optional)">
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/30 resize-y min-h-[96px]"
            placeholder="Steps to reproduce, device, etc."
            maxLength={4000}
          />
        </Field>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 disabled:opacity-50 min-h-[44px]"
        >
          {busy ? 'Submitting…' : 'Submit report'}
        </button>
      </form>
    </Card>
  )
}
