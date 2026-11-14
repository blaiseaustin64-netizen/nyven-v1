import { useCallback, useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  Sparkles,
  Palette,
  Mic,
  Shield,
  BarChart3,
  Monitor,
  Bug,
  ChevronLeft,
  Loader2,
  Archive,
  Search,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import { InstallPrompt } from '../components/InstallPrompt'
import { isStandalone } from '../lib/pwa'
import { useConversationHistory } from '../lib/chat/ConversationHistoryContext'
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
  | 'appearance'
  | 'ai'
  | 'voice'
  | 'conversations'
  | 'privacy'
  | 'usage'
  | 'sessions'
  | 'support'

const sections: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'conversations', label: 'Conversations', icon: Archive },
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
  const [installOpen, setInstallOpen] = useState(false)
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
    appearance: { label: 'Appearance', hint: 'Theme and text size' },
    conversations: { label: 'Conversations', hint: 'Archived chats' },
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
    { title: 'Experience', ids: ['appearance', 'ai', 'voice'] },
    { title: 'Chats', ids: ['conversations'] },
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
              : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-[var(--nyven-input-bg)]'
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
            className="lg:hidden p-2 rounded-xl hover:bg-[var(--nyven-input-bg)] text-nyven-text-secondary min-h-[44px] min-w-[44px] flex items-center justify-center"
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
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/80">
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
            <span className="text-[11px] px-2 py-1 rounded-full border border-[var(--nyven-border)] text-nyven-text-secondary shrink-0">
              Free
            </span>
          </div>

          {mobileGroups.map((g) => (
            <div key={g.title}>
              <p className="text-xs uppercase tracking-wide text-nyven-text-secondary/80 px-1 mb-2">
                {g.title}
              </p>
              <div className="rounded-2xl border border-[var(--nyven-border)] bg-nyven-surface/60 overflow-hidden divide-y divide-[var(--nyven-border)]">
                {g.ids.map((id) => {
                  const Icon = sections.find((s) => s.id === id)!.icon
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActive(id)}
                      className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left active:bg-nyven-cyan/10"
                    >
                      <span className="w-10 h-10 rounded-xl bg-[var(--nyven-surface)] flex items-center justify-center text-nyven-text-secondary shrink-0">
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
{active === 'appearance' && (
              <AppearanceSettingsPanel showToast={showToast} />
            )}

            {active === 'conversations' && (
              <ArchiveSettingsPanel />
            )}

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
                          className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => void saveProfile()}
                        className="mt-2 px-4 py-2 rounded-xl bg-nyven-surface border border-[var(--nyven-border)] text-sm hover:bg-[var(--nyven-input-bg)]"
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
                          className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <Field label="Confirm">
                        <input
                          type="password"
                          value={password2}
                          onChange={(e) => setPassword2(e.target.value)}
                          className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => void changePassword()}
                        className="mt-2 px-4 py-2 rounded-xl text-sm border border-[var(--nyven-border)] hover:bg-[var(--nyven-input-bg)]"
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
                          className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400/40"
                          autoComplete="current-password" />
                      </Field>
                      <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Type DELETE"
                        className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm mb-2 mt-2 outline-none" />
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
                    {!isStandalone() && (
                      <button
                        type="button"
                        onClick={() => setInstallOpen(true)}
                        className="text-sm text-[var(--nyven-cyan)]"
                      >
                        Install Nyven
                      </button>
                    )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        { value: 'balanced', label: 'Balanced', hint: 'Clear, natural and helpful.' },
                        { value: 'direct', label: 'Direct', hint: 'Straight to the point.' },
                        { value: 'creative', label: 'Creative', hint: 'More expressive and imaginative.' },
                        { value: 'deep', label: 'Deep', hint: 'More detailed and analytical.' },
                        { value: 'casual', label: 'Casual', hint: 'Relaxed and conversational.' },
                      ] as const).map((opt) => {
                        const selected = prefs.ai.responseStyle === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              void persistPrefs({
                                ...prefs,
                                ai: { ...prefs.ai, responseStyle: opt.value },
                              })
                            }
                            className={`text-left rounded-xl border px-3 py-3 transition ${
                              selected
                                ? 'border-[var(--nyven-cyan)] bg-[var(--nyven-bg-secondary)]'
                                : 'border-[var(--nyven-border)] bg-[var(--nyven-bg)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[var(--nyven-text)]">{opt.label}</span>
                              {selected && <span className="text-[var(--nyven-cyan)] text-xs">✓</span>}
                            </div>
                            <p className="text-[0.75rem] text-[var(--nyven-text-secondary)] mt-1 leading-snug">{opt.hint}</p>
                          </button>
                        )
                      })}
                    </div>
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
                        className="flex items-start gap-2 py-2 border-b border-[var(--nyven-border)] last:border-0"
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
                        className="mt-2 px-4 py-2 rounded-xl text-sm border border-[var(--nyven-border)] hover:bg-[var(--nyven-input-bg)]"
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
      {installOpen && <InstallPrompt forceOpen onClose={() => setInstallOpen(false)} />}
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
    <div className="bg-nyven-surface border border-[var(--nyven-border)] rounded-2xl p-4 space-y-3">
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
          on ? 'bg-nyven-cyan/40' : 'bg-[var(--nyven-input-bg)]'
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
      className="w-full bg-nyven-bg border border-[var(--nyven-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-nyven-cyan/40"
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
    <div className="flex justify-between text-sm py-1.5 border-b border-[var(--nyven-border)] last:border-0">
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
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-[var(--nyven-border)] text-sm outline-none focus:border-nyven-cyan/30 min-h-[44px]"
            placeholder="Brief summary"
            maxLength={500}
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-[var(--nyven-border)] text-sm outline-none min-h-[44px]"
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
            className="w-full px-3 py-2.5 rounded-xl bg-nyven-bg border border-[var(--nyven-border)] text-sm outline-none focus:border-nyven-cyan/30 resize-y min-h-[96px]"
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

function AppearanceSettingsPanel({ showToast }: { showToast: (m: string) => void }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('nyven_appearance_v1') || '{}')
      const theme = raw.theme === 'default' ? 'nyven' : (raw.theme || 'nyven')
      return { theme, textScale: typeof raw.textScale === 'number' ? raw.textScale : 1 }
    } catch {
      return { theme: 'nyven', textScale: 1 }
    }
  })

  const apply = (next: { theme?: string; textScale?: number }) => {
    try { navigator.vibrate?.(10) } catch { /* */ }
    const merged = { theme: prefs.theme, textScale: prefs.textScale, ...next }
    setPrefs(merged)
    localStorage.setItem('nyven_appearance_v1', JSON.stringify(merged))
    void import('../lib/appearance').then(({ applyAppearance }) => {
      applyAppearance(merged as { theme: 'nyven' | 'system' | 'dark' | 'light'; textScale: number })
    })
    showToast('Appearance updated')
  }

  const options = [
    { id: 'nyven', label: 'NYVEN', hint: 'Signature navy and cyan' },
    { id: 'system', label: 'System', hint: 'Match your device' },
    { id: 'dark', label: 'Dark', hint: 'True black, immersive' },
    { id: 'light', label: 'Light', hint: 'Warm ivory' },
  ] as const

  return (
    <>
      <SectionTitle title="Appearance" desc="Theme for the whole NYVEN interface." />
      <Card>
        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => {
            const selected = prefs.theme === o.id
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => apply({ theme: o.id })}
                className={`relative text-left rounded-2xl border p-3 transition ${
                  selected
                    ? 'border-[var(--nyven-cyan)] bg-[var(--nyven-bg-secondary)]'
                    : 'border-[var(--nyven-border)] bg-[var(--nyven-bg)]'
                }`}
              >
                {selected && (
                  <span className="absolute top-2 right-2 text-[var(--nyven-cyan)] text-xs font-bold">✓</span>
                )}
                <p className="text-sm font-medium text-[var(--nyven-text)]">{o.label}</p>
                <div className="mt-2 h-8 rounded-lg overflow-hidden border border-[var(--nyven-border)] flex">
                  {o.id === 'nyven' && (
                    <>
                      <span className="flex-1" style={{ background: '#07090D' }} />
                      <span className="w-1/3" style={{ background: '#62E6FF' }} />
                    </>
                  )}
                  {o.id === 'system' && (
                    <>
                      <span className="flex-1" style={{ background: '#F6F4EF' }} />
                      <span className="flex-1" style={{ background: '#000' }} />
                    </>
                  )}
                  {o.id === 'dark' && (
                    <>
                      <span className="flex-1" style={{ background: '#000' }} />
                      <span className="w-1/4" style={{ background: '#fff' }} />
                    </>
                  )}
                  {o.id === 'light' && (
                    <>
                      <span className="flex-1" style={{ background: '#F6F4EF' }} />
                      <span className="w-1/3" style={{ background: '#1A1D24' }} />
                    </>
                  )}
                </div>
                <p className="text-[0.75rem] text-[var(--nyven-text-secondary)] mt-2">{o.hint}</p>
              </button>
            )
          })}
        </div>
        <div className="mt-4 rounded-xl border border-[var(--nyven-border)] bg-[var(--nyven-bg)] p-3">
          <p className="text-[0.75rem] text-[var(--nyven-text-secondary)] mb-2">Live preview</p>
          <div className="rounded-2xl bg-[var(--nyven-surface)] border border-[var(--nyven-border)] px-3 py-2 text-[0.9375rem] text-[var(--nyven-text)] inline-block mb-2">
            What can you help me with?
          </div>
          <p className="text-[0.9375rem] text-[var(--nyven-text)] leading-relaxed">
            I can help you think, write, and build — ask anything.
          </p>
        </div>
      </Card>
      <Card>
        <Field label="Text size">
          <input
            type="range"
            min={0.9}
            max={1.25}
            step={0.05}
            value={prefs.textScale}
            onChange={(e) => apply({ textScale: Number(e.target.value) })}
            className="w-full accent-[var(--nyven-cyan)]"
          />
        </Field>
      </Card>
    </>
  )
}

const ARCHIVE_KEY = 'nyven_archived_chats_v1'

function loadArchiveIds(): string[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function saveArchiveIds(ids: string[]) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids))
}

function ArchiveSettingsPanel() {
  const { conversations, deleteConversation, refresh } = useConversationHistory()
  const [ids, setIds] = useState<string[]>(() => loadArchiveIds())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const longPressRef = useRef<number | null>(null)

  const archived = conversations
    .filter((c) => ids.includes(c.id))
    .filter((c) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (c.title || '').toLowerCase().includes(q)
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  const restore = (idList: string[]) => {
    const next = ids.filter((id) => !idList.includes(id))
    setIds(next)
    saveArchiveIds(next)
    setSelected(new Set())
    setSelectionMode(false)
    setConfirmDelete(false)
    void refresh()
  }

  const remove = (idList: string[]) => {
    for (const id of idList) {
      try { deleteConversation?.(id) } catch { /* */ }
    }
    restore(idList)
  }

  return (
    <>
      <SectionTitle title="Archive" desc="Archived chats are hidden from the main history until restored." />
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nyven-text-secondary)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived chats"
          className="w-full h-11 pl-9 pr-3 rounded-xl bg-[var(--nyven-surface)] border border-[var(--nyven-border)] text-sm text-[var(--nyven-text)] outline-none"
        />
      </div>
      {archived.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--nyven-text-secondary)] text-center py-8">
            No archived chats yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {archived.map((c) => {
            const isSel = selected.has(c.id)
            const when = c.updatedAt
              ? new Date(c.updatedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : ''
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (selectionMode) {
                    setSelected((prev) => {
                      const n = new Set(prev)
                      if (n.has(c.id)) n.delete(c.id)
                      else n.add(c.id)
                      return n
                    })
                    return
                  }
                  window.location.assign(`/chat?c=${encodeURIComponent(c.id)}`)
                }}
                onTouchStart={() => {
                  longPressRef.current = window.setTimeout(() => {
                    try { navigator.vibrate?.(12) } catch { /* */ }
                    setSelectionMode(true)
                    setSelected(new Set([c.id]))
                  }, 450)
                }}
                onTouchEnd={() => {
                  if (longPressRef.current) window.clearTimeout(longPressRef.current)
                }}
                onTouchMove={() => {
                  if (longPressRef.current) window.clearTimeout(longPressRef.current)
                }}
                className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                  isSel
                    ? 'border-[var(--nyven-cyan)] bg-[var(--nyven-bg-secondary)]'
                    : 'border-[var(--nyven-border)] bg-[var(--nyven-surface)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--nyven-text)] truncate">{c.title || 'Chat'}</p>
                    <p className="text-[0.75rem] text-[var(--nyven-text-secondary)] mt-0.5">{when}</p>
                  </div>
                  {!selectionMode && (
                    <div className="hidden sm:flex gap-1 shrink-0">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); restore([c.id]) }}
                        className="p-2 rounded-lg text-[var(--nyven-text-secondary)] hover:text-[var(--nyven-text)]"
                        aria-label="Restore"
                      >
                        <RotateCcw size={16} />
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setSelected(new Set([c.id])); setConfirmDelete(true) }}
                        className="p-2 rounded-lg text-red-400"
                        aria-label="Delete"
                      >
                        <Trash2 size={16} />
                      </span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectionMode && selected.size > 0 && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex gap-2 px-3 py-2 rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] shadow-xl">
          <button type="button" className="px-4 h-11 rounded-xl text-sm text-[var(--nyven-text)]" onClick={() => { setSelectionMode(false); setSelected(new Set()) }}>Cancel</button>
          <button type="button" className="px-4 h-11 rounded-xl text-sm text-[var(--nyven-cyan)] font-medium inline-flex items-center gap-1.5" onClick={() => restore([...selected])}>
            <RotateCcw size={16} /> Restore
          </button>
          <button type="button" className="px-4 h-11 rounded-xl text-sm text-red-400 font-medium inline-flex items-center gap-1.5" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-[var(--nyven-overlay)]" aria-label="Close" onClick={() => setConfirmDelete(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--nyven-border)] bg-[var(--nyven-surface)] p-4">
            <p className="text-sm text-[var(--nyven-text)] font-medium">Delete permanently?</p>
            <p className="text-[0.8125rem] text-[var(--nyven-text-secondary)] mt-1">This cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <button type="button" className="flex-1 h-11 rounded-xl border border-[var(--nyven-border)]" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="flex-1 h-11 rounded-xl bg-red-500/20 text-red-400 font-medium" onClick={() => remove([...selected])}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

