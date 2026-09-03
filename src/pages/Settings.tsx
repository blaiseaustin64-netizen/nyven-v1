import { useState } from 'react'
import { motion } from 'framer-motion'

type Section = 'account' | 'appearance' | 'preferences' | 'notifications' | 'privacy' | 'subscription'

const sections: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'preferences', label: 'NYVEN preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'subscription', label: 'Subscription' },
]

export function Settings() {
  const [active, setActive] = useState<Section>('account')
  const [theme, setTheme] = useState('system')
  const [responseStyle, setResponseStyle] = useState('balanced')

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="font-display text-2xl sm:text-3xl font-medium mb-8">Settings</h1>

        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
          {/* Section nav */}
          <nav className="sm:w-48 shrink-0 flex sm:flex-col gap-1 overflow-x-auto pb-2 sm:pb-0">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`px-3 py-2 rounded-xl text-sm font-medium text-left whitespace-nowrap transition-colors ${
                  active === s.id
                    ? 'bg-nyven-surface text-nyven-cyan'
                    : 'text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.03]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 min-w-0"
          >
            {active === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-medium mb-1">Account</h2>
                  <p className="text-sm text-nyven-text-secondary mb-4">
                    Authentication will be available in a later phase.
                  </p>
                  <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-nyven-text-secondary">Status</span>
                      <span>Guest (demo)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-nyven-text-secondary">Email</span>
                      <span className="text-nyven-text-secondary">—</span>
                    </div>
                  </div>
                </div>
                <button className="text-sm text-red-400/80 hover:text-red-400">
                  Sign out (coming soon)
                </button>
              </div>
            )}

            {active === 'appearance' && (
              <div className="space-y-5">
                <h2 className="font-medium">Appearance</h2>
                <div>
                  <label className="text-sm text-nyven-text-secondary block mb-2">Theme</label>
                  <div className="flex gap-2">
                    {['system', 'dark'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`px-4 py-2 rounded-xl text-sm capitalize transition-colors ${
                          theme === t
                            ? 'bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/30'
                            : 'bg-nyven-surface border border-white/[0.06] text-nyven-text-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-nyven-text-secondary mt-2">
                    NYVEN is designed primarily for dark environments.
                  </p>
                </div>
              </div>
            )}

            {active === 'preferences' && (
              <div className="space-y-5">
                <h2 className="font-medium">NYVEN preferences</h2>
                <div>
                  <label className="text-sm text-nyven-text-secondary block mb-2">
                    Response style
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['concise', 'balanced', 'detailed'].map((s) => (
                      <button
                        key={s}
                        onClick={() => setResponseStyle(s)}
                        className={`px-4 py-2 rounded-xl text-sm capitalize transition-colors ${
                          responseStyle === s
                            ? 'bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/30'
                            : 'bg-nyven-surface border border-white/[0.06] text-nyven-text-secondary'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {active === 'notifications' && (
              <div>
                <h2 className="font-medium mb-2">Notifications</h2>
                <p className="text-sm text-nyven-text-secondary">
                  Notification preferences will be available once accounts are connected.
                </p>
              </div>
            )}

            {active === 'privacy' && (
              <div>
                <h2 className="font-medium mb-2">Privacy</h2>
                <p className="text-sm text-nyven-text-secondary mb-4">
                  Your conversations stay on this device in V1. Backend storage and privacy controls will arrive with authentication.
                </p>
              </div>
            )}

            {active === 'subscription' && (
              <div>
                <h2 className="font-medium mb-2">Subscription</h2>
                <p className="text-sm text-nyven-text-secondary mb-4">
                  You are currently on the Free plan.
                </p>
                <button className="px-4 py-2.5 rounded-xl bg-nyven-cyan/15 text-nyven-cyan text-sm font-medium border border-nyven-cyan/25">
                  View NYVEN+
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
                  }
