import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Monitor,
  Smartphone,
  Tablet,
  Save,
  Rocket,
  ArrowLeft,
  MessageSquare,
  Eye,
} from 'lucide-react'
import { NIdentity } from '../components/NIdentity'
import { MessageComposer } from '../components/MessageComposer'
import { builderPhases } from '../lib/mockData'
import { composePreviewDocument, saveProject } from '../lib/projectStore'
import type { NyvenProject } from '../lib/builderTypes'
import clsx from 'clsx'

type ViewMode = 'chat' | 'preview'
type Device = 'desktop' | 'tablet' | 'mobile'

const livePhases = [
  'Understanding your idea...',
  'Planning the experience...',
  'Designing the structure...',
  'Creating the visual direction...',
  'Writing the code...',
  'Building your website...',
  'Preparing your preview...',
]

export function Builder() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as {
    description?: string
    type?: string
    style?: string
    features?: string[]
    project?: NyvenProject
  }) || {}

  const [phaseIdx, setPhaseIdx] = useState(0)
  const [isGenerating, setIsGenerating] = useState(!state.project)
  const [isReady, setIsReady] = useState(!!state.project)
  const [viewMode, setViewMode] = useState<ViewMode>(state.project ? 'preview' : 'chat')
  const [device, setDevice] = useState<Device>('desktop')
  const [project, setProject] = useState<NyvenProject | null>(state.project || null)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<
    { role: 'user' | 'nyven'; content: string; thinking?: boolean }[]
  >([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const description = state.description || 'Build a modern website for me.'
    setMessages([{ role: 'user', content: description }])

    if (state.project) {
      setMessages((prev) => [
        ...prev,
        { role: 'nyven', content: 'Your website is ready. Open the preview to inspect it.' },
      ])
      return
    }

    let idx = 0
    setMessages((prev) => [
      ...prev,
      { role: 'nyven', content: livePhases[0], thinking: true },
    ])

    const interval = setInterval(() => {
      idx = Math.min(idx + 1, livePhases.length - 1)
      setPhaseIdx(idx)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.thinking) {
          return [...prev.slice(0, -1), { role: 'nyven', content: livePhases[idx], thinking: true }]
        }
        return prev
      })
    }, 1100)

    const run = async () => {
      try {
        const res = await fetch('/api/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description,
            websiteType: state.type || '',
            style: state.style || '',
            features: state.features || [],
          }),
        })
        const data = await res.json()
        clearInterval(interval)

        if (!res.ok || !data.success || !data.project) {
          setError(data?.error || 'NYVEN could not finish this website.')
          setIsGenerating(false)
          setMessages((prev) => [
            ...prev.filter((m) => !m.thinking),
            { role: 'nyven', content: data?.error || 'I could not finish building this website. Please try again from Build.' },
          ])
          return
        }

        const built = data.project as NyvenProject
        saveProject(built)
        setProject(built)
        setIsGenerating(false)
        setIsReady(true)
        setPhaseIdx(livePhases.length)
        setMessages((prev) => [
          ...prev.filter((m) => !m.thinking),
          {
            role: 'nyven',
            content: `Your website is ready. I created ${built.name} as a ${built.style.toLowerCase()} ${built.websiteType.toLowerCase()} experience. Open the preview to inspect the live result.`,
          },
        ])
        if (window.innerWidth >= 1024) {
          setTimeout(() => setViewMode('preview'), 500)
        }
      } catch {
        clearInterval(interval)
        setIsGenerating(false)
        setError('I could not reach NYVEN Builder. Please try again.')
        setMessages((prev) => [
          ...prev.filter((m) => !m.thinking),
          { role: 'nyven', content: 'I could not reach NYVEN Builder. Please try again.' },
        ])
      }
    }

    run()
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      {
        role: 'nyven',
        content:
          'I can see that request. Advanced editing of an existing website will arrive in a later NYVEN Builder phase. For now, start a new build from the Build page to generate a fresh version.',
      },
    ])
  }

  const projectTitle = project?.name || state.type || state.description?.slice(0, 28) || 'Untitled Project'
  const previewDoc = project ? composePreviewDocument(project.files) : ''

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between gap-3 px-3 sm:px-4 h-14 border-b border-white/[0.05] bg-nyven-bg/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/build')}
            className="p-2 rounded-lg text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-medium text-sm truncate">{projectTitle}</span>
          {isGenerating && (
            <span className="hidden sm:inline text-xs text-nyven-cyan animate-pulse">
              Generating…
            </span>
          )}
          {isReady && (
            <span className="hidden sm:inline text-xs text-emerald-400/80">Ready</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex lg:hidden bg-nyven-surface rounded-lg p-0.5 border border-white/[0.06]">
            <button
              onClick={() => setViewMode('chat')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'chat' ? 'bg-white/[0.08] text-nyven-text' : 'text-nyven-text-secondary'
              )}
            >
              <MessageSquare size={14} className="inline mr-1" />
              Chat
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'preview' ? 'bg-white/[0.08] text-nyven-text' : 'text-nyven-text-secondary'
              )}
            >
              <Eye size={14} className="inline mr-1" />
              Preview
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-0.5 bg-nyven-surface rounded-lg p-0.5 border border-white/[0.06]">
            {[
              { id: 'desktop' as Device, icon: Monitor },
              { id: 'tablet' as Device, icon: Tablet },
              { id: 'mobile' as Device, icon: Smartphone },
            ].map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setDevice(id)}
                className={clsx(
                  'p-1.5 rounded-md transition-colors',
                  device === id ? 'bg-white/[0.1] text-nyven-cyan' : 'text-nyven-text-secondary hover:text-nyven-text'
                )}
                aria-label={id}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>

          <button
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-nyven-text-secondary hover:text-nyven-text hover:bg-white/[0.05]"
            title="Save (coming soon)"
          >
            <Save size={14} />
            Save
          </button>
          {project ? (
            <button
              onClick={() => navigate(`/preview/${project.slug}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/25 hover:bg-nyven-cyan/25 transition-colors"
            >
              <Rocket size={14} />
              <span className="hidden sm:inline">Open preview</span>
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/25"
              title="Publish (coming soon)"
            >
              <Rocket size={14} />
              <span className="hidden sm:inline">Publish</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div
          className={clsx(
            'flex flex-col border-r border-white/[0.05] bg-nyven-bg-secondary/20',
            viewMode === 'chat' ? 'flex w-full lg:w-[380px] xl:w-[420px]' : 'hidden lg:flex lg:w-[380px] xl:w-[420px]'
          )}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={clsx('flex gap-3', msg.role === 'user' && 'justify-end')}>
                {msg.role === 'nyven' && (
                  <NIdentity
                    state={msg.thinking ? 'thinking' : 'white'}
                    size={28}
                    animated={!!msg.thinking}
                  />
                )}
                <div
                  className={clsx(
                    'max-w-[85%] text-[14px] leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-nyven-surface border border-white/[0.06] rounded-2xl rounded-br-md px-3.5 py-2.5'
                      : 'text-nyven-text'
                  )}
                >
                  {msg.thinking && (
                    <span className="text-nyven-cyan text-xs block mb-1 animate-pulse">
                      Processing
                    </span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <MessageComposer
            onSend={handleSend}
            isGenerating={isGenerating}
            placeholder="Guide NYVEN..."
          />
        </div>

        <div
          className={clsx(
            'flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-nyven-bg overflow-hidden',
            viewMode === 'preview' ? 'flex' : 'hidden lg:flex'
          )}
        >
          <AnimatePresence mode="wait">
            {!isReady ? (
              <motion.div
                key="generating"
                className="flex flex-col items-center gap-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <NIdentity state="thinking" size={72} />
                <div>
                  <p className="font-display text-lg mb-1">
                    {livePhases[phaseIdx] || builderPhases[0].label}
                  </p>
                  <p className="text-sm text-nyven-text-secondary">
                    NYVEN is building your experience
                  </p>
                </div>
                <div className="w-48 h-1 bg-nyven-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-nyven-cyan to-nyven-violet"
                    initial={{ width: '5%' }}
                    animate={{ width: `${((phaseIdx + 1) / livePhases.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                {error && <p className="text-sm text-red-400 max-w-sm">{error}</p>}
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                className={clsx(
                  'bg-nyven-surface border border-white/[0.08] rounded-xl overflow-hidden shadow-nyven transition-all duration-300',
                  device === 'desktop' && 'w-full max-w-4xl h-[70vh]',
                  device === 'tablet' && 'w-[768px] max-w-full h-[65vh]',
                  device === 'mobile' && 'w-[375px] max-w-full h-[70vh]'
                )}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <iframe
                  title={`${projectTitle} preview`}
                  srcDoc={previewDoc}
                  sandbox="allow-scripts allow-forms allow-modals"
                  className="w-full h-full border-0 bg-white"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
    }
