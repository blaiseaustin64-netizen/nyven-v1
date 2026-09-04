import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { composePreviewDocument, getProjectBySlug } from '../lib/projectStore'

export function Preview() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const project = slug ? getProjectBySlug(slug) : null
  const doc = useMemo(
    () => (project ? composePreviewDocument(project.files) : ''),
    [project]
  )

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl mb-2">Preview not available</p>
        <p className="text-sm text-nyven-text-secondary max-w-md mb-6">
          This BUILD 1 preview lives in the current browser session. Persistent public
          NYVEN preview URLs require storage and hosting in a later phase.
        </p>
        <button
          onClick={() => navigate('/build')}
          className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
        >
          Back to Build
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="h-12 px-3 flex items-center gap-3 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => navigate('/builder', { state: { project } })}
          className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text"
          aria-label="Back to builder"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm truncate">{project.name}</span>
        <span className="ml-auto text-[11px] text-nyven-text-secondary">
          /preview/{project.slug}
        </span>
      </header>
      <iframe
        title={project.name}
        srcDoc={doc}
        sandbox="allow-scripts allow-forms allow-modals"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  )
}
