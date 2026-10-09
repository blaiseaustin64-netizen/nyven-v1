import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  Sparkles,
  Mic,
  Shield,
  Link2,
  BarChart3,
  Monitor,
  Bug,
  ChevronLeft,
  Loader2,
  Github,
  Mail,
  Calendar,
  Activity,
  Table2,
} from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type NyvenPreferences,
} from '../lib/settings/preferences'
import { fetchUsageSummary, type UsageSummary } from '../lib/settings/usageSummary'
import { INTEGRATIONS, listConnections } from '../lib/settings/connectionsUi'
import {
  listMemories,
  deleteMemory,
  setMemoryEnabled,
} from '../lib/memoryStore'
import type { MemoryRow } from '../lib/supabase/types'
import type { ConnectionPublicRow } from '../lib/supabase/types'
import { getSupabase } from '../lib/supabase/client'
import { setVoicePreferences } from '../lib/voice/preferences'

type Section =
  | 'account'
  | 'ai'
  | 'voice'
  | 'privacy'
  | 'connections'
  | 'usage'
  | 'sessions'
  | 'support'

const sections: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'connections', label: 'Connected services', icon: Link2 },
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
  const active = (params.get('section') as Section) || 'account'
  const setActive = (s: Section) => setParams({ section: s })

  const [prefs, setPrefs] = useState<NyvenPreferences>(DEFAULT_PREFERENCES)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [memories, setMemories] = useState<MemoryRow[]>([])
  const [connections, setConnections] = useState<ConnectionPublicRow[]>([])
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

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
    if (active === 'connections' && userId) {
      void listConnections(userId).then(setConnections)
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
    const sb = getSupabase()
    if (!sb) return
    setSaving(true)
    const { error } = await sb
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', userId)
    setSaving(false)
    if (error) showToast(error.message)
    else {
      await refreshProfile()
      showToast('Profile updated')
    }
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
    const sb = getSupabase()
    if (!sb) return
    setSaving(true)
    const { error } = await sb.auth.updateUser({ password })
    setSaving(false)
    if (error) showToast(error.message)
    else {
      setPassword('')
      setPassword2('')
      showToast('Password updated')
    }
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
    if (deleteConfirm !== 'DELETE') {
      showToast('Type DELETE to confirm')
      return
    }
    // Safe entry point: sign out and instruct; full server delete needs service role
    showToast('Contact support or use Supabase dashboard for full account deletion.')
    await signOut()
  }

  const sectionNav = (
    <nav className="sm:w-52 shrink-0 flex sm:flex-col gap-1 overflow-x-auto pb-2 sm:pb-0 -mx-1 px-1 scrollbar-thin">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActive(id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-left whitespace-nowrap transition-colors ${
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

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link
            to="/chat"
            className="lg:hidden p-2 rounded-xl hover:bg-white/[0.04] text-nyven-text-secondary"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-medium">Settings</h1>
          {saving && (
            <Loader2 size={16} className="animate-spin text-nyven-text-secondary" />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
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
                      Supabase is not configured. Set VITE_SUPABASE_URL and
                      VITE_SUPABASE_ANON_KEY to enable accounts.
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
                      <h3 className="text-sm font-medium mb-2 text-red-300/90">
                        Delete account
                      </h3>
                      <p className="text-xs text-nyven-text-secondary mb-3">
                        Type DELETE to confirm. Full server-side erasure may require
                        dashboard support until a dedicated delete endpoint ships.
                      </p>
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="DELETE"
                        className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2 text-sm mb-2 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void requestAccountDelete()}
                        className="text-sm text-red-400/90 hover:text-red-400"
                      >
                        Request account deletion
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
                    Chat model routing remains server-side (Gemini). Preferences do not
                    expose API keys or switch providers from the browser.
                  </p>
                </Card>
              </>
            )}

            {/* ── Voice ── */}
            {active === 'voice' && (
              <>
                <SectionTitle
                  title="Voice"
                  desc="Uses OpenRouter Fish Audio S2.1 Pro Free with Sua. Provider keys stay server-side."
                />
                <Card>
                  <Field label="Voice features">
                    <Toggle
                      on={prefs.voice.voiceEnabled}
                      onChange={(on) =>
                        void persistPrefs({
                          ...prefs,
                          voice: { ...prefs.voice, voiceEnabled: on },
                        })
                      }
                      label={prefs.voice.voiceEnabled ? 'Enabled' : 'Disabled'}
                    />
                  </Field>
                  <Field label="Auto-speak responses">
                    <Toggle
                      on={prefs.voice.autoSpeak}
                      onChange={(on) =>
                        void persistPrefs({
                          ...prefs,
                          voice: { ...prefs.voice, autoSpeak: on },
                        })
                      }
                      label={prefs.voice.autoSpeak ? 'On' : 'Off'}
                    />
                  </Field>
                  <Field label="TTS voice">
                    <p className="text-sm">
                      Sua{' '}
                      <span className="text-xs text-nyven-text-secondary">
                        (Fish Audio · free via OpenRouter)
                      </span>
                    </p>
                    <p className="text-xs text-nyven-text-secondary mt-1 font-mono break-all">
                      {prefs.voice.voiceId}
                    </p>
                  </Field>
                  <p className="text-xs text-nyven-text-secondary">
                    Stop generation cancels in-flight TTS. Microphone requires browser
                    permission.
                  </p>
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
                      protected by Supabase RLS.
                    </p>
                  )}
                </Card>
              </>
            )}

            {/* ── Connections ── */}
            {active === 'connections' && (
              <>
                <SectionTitle
                  title="Connected services"
                  desc="Connector foundation for future agents. Status is real — never faked."
                />
                {!userId && (
                  <Card>
                    <p className="text-sm text-nyven-text-secondary">
                      Sign in to manage connections. Tokens are stored server-side only.
                    </p>
                  </Card>
                )}
                {INTEGRATIONS.map((integ) => {
                  const row = connections.find((c) => c.provider === integ.id)
                  const status = row?.status || 'disconnected'
                  const label = !integ.oauthReady
                    ? 'Coming soon'
                    : status === 'connected'
                      ? 'Connected'
                      : status === 'error' || status === 'expired'
                        ? 'Connection needs attention'
                        : status === 'pending'
                          ? 'Connecting…'
                          : 'Not connected'
                  const Icon =
                    integ.iconKey === 'github'
                      ? Github
                      : integ.iconKey === 'mail'
                        ? Mail
                        : integ.iconKey === 'calendar'
                          ? Calendar
                          : integ.iconKey === 'activity'
                            ? Activity
                            : integ.iconKey === 'table'
                              ? Table2
                              : Link2
                  return (
                    <Card key={integ.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
                            <Icon size={16} className="text-nyven-cyan" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-medium">{integ.name}</h3>
                            <p className="text-xs text-nyven-text-secondary mt-1 leading-relaxed">
                              {integ.description}
                            </p>
                            {integ.permissionSummary?.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {integ.permissionSummary.slice(0, 3).map((p) => (
                                  <li
                                    key={p}
                                    className="text-[11px] text-nyven-text-secondary/80 flex gap-1.5"
                                  >
                                    <Shield size={10} className="mt-0.5 shrink-0 opacity-70" />
                                    <span>{p}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {row?.account_label && status === 'connected' && (
                              <p className="text-[11px] text-nyven-text-secondary mt-2">
                                {row.account_label}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={
                            'text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 ' +
                            (label === 'Connected'
                              ? 'bg-emerald-400/10 text-emerald-400'
                              : label === 'Coming soon'
                                ? 'bg-white/[0.04] text-nyven-text-secondary'
                                : label.includes('attention')
                                  ? 'bg-red-400/10 text-red-300'
                                  : 'bg-white/[0.04] text-nyven-text-secondary')
                          }
                        >
                          {label}
                        </span>
                      </div>
                      {!integ.oauthReady && (
                        <p className="text-xs text-nyven-text-secondary mt-3 pt-2 border-t border-white/[0.04]">
                          Connect path not implemented yet. Secure token storage and OAuth
                          will be added before this can show Connected.
                        </p>
                      )}
                      {integ.oauthReady && status !== 'connected' && (
                        <p className="text-xs text-nyven-text-secondary mt-3 pt-2 border-t border-white/[0.04]">
                          Connect is available when the OAuth flow is enabled for your
                          account.
                        </p>
                      )}
                    </Card>
                  )
                })}
              </>
            )}

            {/* ── Usage ── */}
            {active === 'usage' && (
              <>
                <SectionTitle
                  title="Usage"
                  desc="Real event counts from the last 30 days. Not rate-limit enforcement."
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
                    <UsageRow label="Messages" value={usage.message} />
                    <UsageRow label="Voice (STT)" value={usage.voice_stt} />
                    <UsageRow label="Voice (TTS)" value={usage.voice_tts} />
                    <UsageRow label="Attachments" value={usage.attachment} />
                    <UsageRow label="Web searches" value={usage.web_search} />
                    <UsageRow label="Tool calls" value={usage.tool_call} />
                    <p className="text-xs text-nyven-text-secondary mt-3">
                      Since {new Date(usage.since).toLocaleDateString()}
                    </p>
                  </Card>
                )}
              </>
            )}

            {/* ── Sessions ── */}
            {active === 'sessions' && (
              <>
                <SectionTitle
                  title="Sessions"
                  desc="Supabase Auth session for this browser."
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
                        Sign out of all devices is available when using Supabase Auth admin
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

function UsageRow({ label, value }: { label: string; value: number }) {
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
      let accessToken: string | undefined
      try {
        const { data } = (await getSupabase()?.auth.getSession()) ?? {
          data: { session: null },
        }
        accessToken = data.session?.access_token
      } catch {
        /* guest */
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`

      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers,
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
