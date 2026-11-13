import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../lib/auth/AuthContext'
import { createProject } from '../../lib/aiProjects/api'

export function ProjectCreate() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-nyven-text-secondary mb-4">Sign in to create a project.</p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium min-h-[44px]"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const submit = async () => {
    const n = name.trim()
    if (!n) {
      setError('Project name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createProject({
        name: n,
        description: description.trim(),
        instructions: instructions.trim(),
      })
      if (!result.project) {
        setError(result.error || 'Could not create project. Please try again.')
        return
      }
      navigate(`/projects/${result.project.id}?tab=chat`, { replace: true })
    } catch {
      setError('Could not create project. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-1.5 text-sm text-nyven-text-secondary hover:text-nyven-text mb-6 min-h-[40px]"
        >
          <ArrowLeft size={16} /> Projects
        </button>
        <h1 className="font-display text-2xl font-medium mb-1">New Project</h1>
        <p className="text-sm text-nyven-text-secondary mb-8 leading-relaxed">
          Create a workspace for ongoing work. Instructions apply to every chat inside this project.
        </p>

        <label className="block mb-5">
          <span className="text-xs font-medium text-nyven-text-secondary uppercase tracking-wider">
            Project name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            placeholder="e.g. VEXDYN Website"
            className="mt-1.5 w-full h-11 px-3 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm outline-none focus:border-nyven-cyan/35"
            autoFocus
          />
        </label>

        <label className="block mb-5">
          <span className="text-xs font-medium text-nyven-text-secondary uppercase tracking-wider">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            placeholder="What is this project about?"
            rows={3}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm outline-none focus:border-nyven-cyan/35 resize-y min-h-[88px]"
          />
        </label>

        <label className="block mb-6">
          <span className="text-xs font-medium text-nyven-text-secondary uppercase tracking-wider">
            Project instructions (optional)
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value.slice(0, 8000))}
            placeholder="How should NYVEN behave in this project? e.g. Act as a senior product manager. Do not change working features without approval."
            rows={5}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-[var(--nyven-input-bg)] border border-[var(--nyven-border)] text-sm outline-none focus:border-nyven-cyan/35 resize-y min-h-[120px]"
          />
        </label>

        {error && <p className="text-sm text-red-300/90 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="px-4 py-2.5 rounded-xl border border-[var(--nyven-border)] text-sm text-nyven-text-secondary min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
