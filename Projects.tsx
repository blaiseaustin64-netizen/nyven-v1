import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MoreHorizontal, ExternalLink, Pencil, Trash2, FolderOpen } from 'lucide-react'
import { mockProjects } from '../lib/mockData'
import type { Project } from '../lib/types'

export function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setMenuOpen(null)
  }

  const handleRename = (id: string) => {
    const name = prompt('Rename project')
    if (name?.trim()) {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
      )
    }
    setMenuOpen(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-medium">My Projects</h1>
            <p className="text-nyven-text-secondary text-sm mt-1">
              Your creations with NYVEN
            </p>
          </div>
          <button
            onClick={() => navigate('/build')}
            className="px-4 py-2.5 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors"
          >
            New project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FolderOpen size={40} className="text-nyven-text-secondary mb-4 opacity-50" />
            <p className="text-nyven-text-secondary mb-4">No projects yet</p>
            <button
              onClick={() => navigate('/build')}
              className="text-nyven-cyan text-sm hover:underline"
            >
              Build your first website
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, i) => (
              <motion.article
                key={project.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="group relative bg-nyven-surface border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.1] transition-colors"
              >
                <div className="h-36 bg-gradient-to-br from-nyven-bg-secondary to-nyven-bg relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-10 rounded-md border border-white/[0.08] bg-white/[0.03]" />
                  </div>
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/40 text-[10px] uppercase tracking-wider text-nyven-text-secondary">
                    {project.type}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-[15px] truncate">{project.name}</h3>
                      <p className="text-xs text-nyven-text-secondary mt-0.5">
                        Edited {project.lastEdited}
                      </p>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setMenuOpen(menuOpen === project.id ? null : project.id)
                        }
                        className="p-1.5 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
                        aria-label="More options"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuOpen === project.id && (
                        <div className="absolute right-0 top-8 z-10 w-36 py-1 rounded-xl bg-nyven-surface border border-white/[0.1] shadow-xl">
                          <button
                            onClick={() => handleRename(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            onClick={() => handleDelete(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/[0.05]"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-xs text-nyven-text-secondary mt-2 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() =>
                        navigate('/builder', {
                          state: { description: project.description, type: project.type },
                        })
                      }
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] text-sm font-medium hover:bg-white/[0.08] transition-colors"
                    >
                      <ExternalLink size={14} />
                      Open
                    </button>
                    <button
                      onClick={() =>
                        navigate('/builder', {
                          state: { description: project.description, type: project.type },
                        })
                      }
                      className="flex-1 py-2 rounded-xl bg-nyven-cyan/15 text-nyven-cyan text-sm font-medium border border-nyven-cyan/20 hover:bg-nyven-cyan/25 transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
