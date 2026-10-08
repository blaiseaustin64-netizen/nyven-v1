import { useState } from 'react'
import { X, Bug, Loader2 } from 'lucide-react'
import { getSupabase } from '../lib/supabase/client'

type Props = {
  open: boolean
  onClose: () => void
  conversationId?: string
  messageId?: string
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'chat', label: 'Chat / responses' },
  { value: 'voice', label: 'Voice' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'agents', label: 'Agents' },
  { value: 'auth', label: 'Sign-in / account' },
  { value: 'ui', label: 'Interface' },
]

export function BugReportModal({ open, onClose, conversationId, messageId }: Props) {
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('general')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (summary.trim().length < 5) {
      setError('Please describe what went wrong.')
      return
    }
    setBusy(true)
    try {
      let accessToken: string | undefined
      try {
        const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } }
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
          conversationId,
          messageId,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          clientVersion: '1.0.0',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string }
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not submit report.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setSummary('')
    setDetails('')
    setError(null)
    setDone(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={close}
      />
      <div className="relative w-full sm:max-w-md bg-nyven-surface border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bug size={18} className="text-nyven-cyan" />
            <h2 className="font-display text-lg font-medium">Report a bug</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-xl text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.04]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-nyven-text">
              Bug report submitted. Thanks for helping us improve NYVEN.
            </p>
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs text-nyven-text-secondary">
              Reports go to the NYVEN team. Do not include passwords or API keys.
            </p>
            <div>
              <label className="text-xs text-nyven-text-secondary block mb-1">
                What went wrong?
              </label>
              <input
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nyven-cyan/40"
                placeholder="Brief summary"
              />
            </div>
            <div>
              <label className="text-xs text-nyven-text-secondary block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-nyven-text-secondary block mb-1">
                Additional details (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                className="w-full bg-nyven-bg border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-nyven-cyan/40 resize-none"
                placeholder="Steps to reproduce, what you expected…"
              />
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-xl text-sm text-nyven-text-secondary hover:text-nyven-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Submit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
