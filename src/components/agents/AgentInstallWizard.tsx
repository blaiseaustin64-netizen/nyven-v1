/**
 * Guided website installation for NYVEN agents.
 * Real domain store + publish only — no fake Verified / Installed.
 * Manual embed code lives under Advanced, not the primary path.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Shield,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Ban,
  Settings2,
} from 'lucide-react'
import clsx from 'clsx'
import {
  addDomain,
  listDomains,
  updateDomain,
  normalizeDomain,
  isValidDomainFormat,
  listActiveAllowlist,
} from '../../lib/domainStore'
import type { AgentDomain } from '../../lib/domainTypes'
import type { AgentInstance } from '../../lib/agentTypes'
import { publishAgentConfig } from '../../lib/agentStore'

type Step = 1 | 2 | 3 | 4

type Props = {
  agent: AgentInstance
  widgetOrigin: string
  embedCode: string
  onCopyEmbed: () => void
  copied: boolean
  onPublish?: () => Promise<boolean>
}

const STEPS = [
  { n: 1 as Step, label: 'Connect' },
  { n: 2 as Step, label: 'Verify' },
  { n: 3 as Step, label: 'Install' },
  { n: 4 as Step, label: 'Done' },
]

export function AgentInstallWizard({
  agent,
  widgetOrigin,
  embedCode,
  onCopyEmbed,
  copied,
  onPublish,
}: Props) {
  const [step, setStep] = useState<Step>(1)
  const [domainInput, setDomainInput] = useState('')
  const [domains, setDomains] = useState<AgentDomain[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installPhase, setInstallPhase] = useState<
    'idle' | 'preparing' | 'publishing' | 'finishing' | 'done' | 'error'
  >('idle')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const refresh = useCallback(() => {
    const list = listDomains(agent.id)
    setDomains(list)
    if (!selectedId && list[0]) setSelectedId(list[0].id)
  }, [agent.id, selectedId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selected = domains.find((d) => d.id === selectedId) || null

  const connectDomain = () => {
    setError(null)
    const d = normalizeDomain(domainInput)
    if (!isValidDomainFormat(d)) {
      setError('Enter a valid domain (example.com).')
      return
    }
    try {
      const row = addDomain({ agentId: agent.id, domain: d, status: 'pending', enabled: true })
      setDomainInput('')
      refresh()
      setSelectedId(row.id)
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add domain.')
    }
  }

  /** Honest verification — no automated challenge yet */
  const markVerified = () => {
    if (!selected) return
    setError(null)
    try {
      updateDomain(selected.id, {
        status: 'verified',
      })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
    }
  }

  const runInstall = async () => {
    if (!selected) {
      setError('Select a domain first.')
      return
    }
    setError(null)
    setBusy(true)
    setInstallPhase('preparing')
    try {
      // Ensure domain enabled for allowlist
      updateDomain(selected.id, { enabled: true })
      setInstallPhase('publishing')
      let ok = true
      if (onPublish) {
        ok = await onPublish()
      } else {
        const res = await publishAgentConfig(agent, [], {
          allowedDomains: listActiveAllowlist(agent.id),
        })
        ok = res.success
        if (!ok && res.error) setError(res.error)
      }
      setInstallPhase('finishing')
      // Brief pause for UI only — not faking backend stages beyond publish
      await new Promise((r) => setTimeout(r, 400))
      if (!ok) {
        setInstallPhase('error')
        setError(
          'Domain saved, but server publish did not complete. You can still use manual installation.'
        )
      } else {
        setInstallPhase('done')
        setStep(4)
      }
    } catch (e) {
      setInstallPhase('error')
      setError(e instanceof Error ? e.message : 'Install failed.')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const agentActive = agent.status === 'active'

  return (
    <div className="max-w-xl space-y-6">
      {/* Step rail */}
      <div className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1 sm:gap-2 flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => {
                if (s.n < step || (s.n === 4 && installPhase === 'done')) setStep(s.n)
              }}
              className={clsx(
                'h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center shrink-0 transition-colors',
                step === s.n
                  ? 'bg-nyven-cyan text-nyven-bg'
                  : step > s.n
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : 'bg-white/[0.06] text-nyven-text-secondary'
              )}
              aria-current={step === s.n ? 'step' : undefined}
            >
              {step > s.n ? <Check size={14} /> : s.n}
            </button>
            <span
              className={clsx(
                'text-[11px] hidden sm:inline',
                step === s.n ? 'text-nyven-text' : 'text-nyven-text-secondary'
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={clsx(
                  'h-px flex-1 mx-1',
                  step > s.n ? 'bg-emerald-400/30' : 'bg-white/[0.06]'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <div className="rounded-2xl border border-white/[0.08] bg-nyven-surface/50 p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
              <Globe size={18} className="text-nyven-cyan" />
            </div>
            <div>
              <h3 className="font-display text-base font-medium">Connect your website</h3>
              <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
                Enter the domain where this agent should appear. No code yet — just the site
                you control.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connectDomain()}
              placeholder="yourwebsite.com"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm outline-none focus:border-nyven-cyan/40"
            />
            <button
              type="button"
              onClick={connectDomain}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
          {domains.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-nyven-text-secondary mb-2">
                Existing domains
              </p>
              <ul className="space-y-1.5">
                {domains.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(d.id)
                        setStep(2)
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm border border-white/[0.06] hover:bg-white/[0.04] flex items-center justify-between"
                    >
                      <span>{d.domain}</span>
                      <span className="text-[10px] uppercase text-nyven-text-secondary">
                        {d.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && selected && (
        <div className="rounded-2xl border border-white/[0.08] bg-nyven-surface/50 p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
              <Shield size={18} className="text-nyven-cyan" />
            </div>
            <div>
              <h3 className="font-display text-base font-medium">Verify your website</h3>
              <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
                Domain: <strong className="text-nyven-text">{selected.domain}</strong>
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-nyven-bg/60 px-4 py-3 text-sm">
            <p className="text-nyven-text-secondary leading-relaxed">
              Automatic domain ownership challenges are not enabled yet. Status stays{' '}
              <strong className="text-nyven-text">Pending</strong> until you confirm you control
              this domain. Do not mark verified for sites you do not own.
            </p>
            <p className="mt-2 text-xs text-nyven-text-secondary/80">
              Current status:{' '}
              <span
                className={clsx(
                  'uppercase tracking-wider text-[11px]',
                  selected.status === 'verified' ? 'text-emerald-300' : 'text-amber-300/90'
                )}
              >
                {selected.status}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.status !== 'verified' && (
              <button
                type="button"
                onClick={markVerified}
                className="px-4 py-2.5 rounded-xl border border-white/[0.1] text-sm text-nyven-text hover:bg-white/[0.04]"
              >
                I control this domain — mark verified
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
            >
              Continue <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-nyven-text-secondary"
            >
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && selected && (
        <div className="rounded-2xl border border-white/[0.08] bg-nyven-surface/50 p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-nyven-cyan" />
            </div>
            <div>
              <h3 className="font-display text-base font-medium">Install NYVEN Agent</h3>
              <p className="text-sm text-nyven-text-secondary mt-1 leading-relaxed">
                Add NYVEN to <strong className="text-nyven-text">{selected.domain}</strong>. NYVEN
                cannot push code onto your server automatically — installation enables the agent
                for this domain and publishes its config. You still place the widget on the site
                (see Advanced if needed).
              </p>
            </div>
          </div>

          {!agentActive && (
            <p className="text-xs text-amber-300/90 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2">
              Agent status is <strong>{agent.status}</strong>. Set it to Active and save so
              visitors receive responses after the widget loads.
            </p>
          )}

          {installPhase !== 'idle' && installPhase !== 'done' && (
            <div className="space-y-2 py-2">
              {(
                [
                  ['preparing', 'Preparing'],
                  ['publishing', 'Publishing configuration'],
                  ['finishing', 'Finishing'],
                  ['error', 'Could not complete'],
                ] as const
              ).map(([key, label]) => {
                const order = ['preparing', 'publishing', 'finishing', 'done']
                const cur = order.indexOf(installPhase === 'error' ? 'publishing' : installPhase)
                const idx = order.indexOf(key)
                const active = installPhase === key
                const done = idx >= 0 && cur > idx
                if (key === 'error' && installPhase !== 'error') return null
                return (
                  <div
                    key={key}
                    className={clsx(
                      'flex items-center gap-2 text-sm',
                      active && 'text-nyven-text',
                      done && 'text-emerald-300/90',
                      !active && !done && 'text-nyven-text-secondary/50'
                    )}
                  >
                    {done ? (
                      <Check size={14} />
                    ) : active ? (
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-nyven-cyan/40 border-t-nyven-cyan animate-spin" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-white/10" />
                    )}
                    {label}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runInstall()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Install'}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-nyven-text-secondary"
            >
              <ArrowLeft size={14} /> Back
            </button>
          </div>

          {/* Advanced / manual */}
          <div className="pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-2 text-sm text-nyven-text-secondary hover:text-nyven-text w-full"
            >
              <Settings2 size={14} />
              Advanced — manual installation
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-nyven-text-secondary leading-relaxed">
                  Paste this once before <code className="text-[10px]">&lt;/body&gt;</code> on
                  pages that should show the agent. Host:{' '}
                  <code className="text-[10px] text-nyven-cyan/80">{widgetOrigin}</code>
                </p>
                <pre className="text-[11px] sm:text-xs bg-nyven-bg border border-white/[0.08] rounded-xl p-3 overflow-x-auto text-nyven-text-secondary whitespace-pre-wrap">
                  {embedCode}
                </pre>
                <button
                  type="button"
                  onClick={onCopyEmbed}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.1] text-xs font-medium"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy installation code'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4 success */}
      {step === 4 && selected && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-400/15 flex items-center justify-center shrink-0">
              <Check size={20} className="text-emerald-300" />
            </div>
            <div>
              <h3 className="font-display text-base font-medium">Installed successfully</h3>
              <p className="text-sm text-nyven-text-secondary mt-1">
                <span className="text-nyven-text font-medium">{agent.name}</span>
                <span className="mx-1.5 text-nyven-text-secondary/50">·</span>
                {selected.domain}
              </p>
              <p className="text-xs text-nyven-text-secondary mt-2">
                Status:{' '}
                <span className={agentActive ? 'text-emerald-300' : 'text-amber-300/90'}>
                  {agentActive ? 'Active' : agent.status}
                </span>
                {' · '}
                Domain: {selected.status}
                {selected.enabled ? ' · Enabled' : ' · Disabled'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://${selected.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
            >
              Open website <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={() => {
                updateDomain(selected.id, { enabled: false })
                refresh()
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/[0.1] text-sm text-nyven-text-secondary"
            >
              <Ban size={14} /> Disable
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3.5 py-2 text-sm text-nyven-text-secondary"
            >
              Manage domains
            </button>
          </div>
          <p className="text-[11px] text-nyven-text-secondary/70 leading-relaxed">
            If the widget is not on the page yet, use Advanced → manual installation on the
            Install step. The agent only answers after it is Active and published.
          </p>
        </div>
      )}

      {step === 2 && !selected && (
        <p className="text-sm text-nyven-text-secondary">
          No domain selected.{' '}
          <button type="button" className="text-nyven-cyan" onClick={() => setStep(1)}>
            Connect a website
          </button>
        </p>
      )}
    </div>
  )
}
