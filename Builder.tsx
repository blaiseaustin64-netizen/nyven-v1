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
import clsx from 'clsx'

type ViewMode = 'chat' | 'preview'
type Device = 'desktop' | 'tablet' | 'mobile'

export function Builder() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as {
    description?: string
    type?: string
    style?: string
    features?: string[]
  }) || {}

  const [phaseIdx, setPhaseIdx] = useState(0)
  const [isGenerating, setIsGenerating] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [device, setDevice] = useState<Device>('desktop')
  const [messages, setMessages] = useState<
    { role: 'user' | 'nyven'; content: string; thinking?: boolean }[]
  >([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Start generation sequence
  useEffect(() => {
    if (!state.description) {
      // If no state, still show a default flow
      setMessages([
        {
          role: 'user',
          content: 'Build a modern website for me.',
        },
      ])
    } else {
      setMessages([
        {
          role: 'user',
          content: state.description,
        },
      ])
    }

    // Animate through phases
    let idx = 0
    const interval = setInterval(() => {
      idx++
      if (idx < builderPhases.length) {
        setPhaseIdx(idx)
        setMessages((prev) => {
          // Update last thinking or add
          const last = prev[prev.length - 1]
          if (last?.thinking) {
            return [
              ...prev.slice(0, -1),
              { role: 'nyven', content: builderPhases[idx].label, thinking: true },
            ]
          }
          return [
            ...prev,
            { role: 'nyven', content: builderPhases[idx].label, thinking: true },
          ]
        })
      } else {
        clearInterval(interval)
        setIsGenerating(false)
        setIsReady(true)
        setMessages((prev) => {
          const withoutThinking = prev.filter((m) => !m.thinking)
          return [
            ...withoutThinking,
            {
              role: 'nyven',
              content:
                "Your website is ready. I've prepared a clean structure based on your description. You can refine it further or switch to the preview to explore the result.",
            },
          ]
        })
        // Auto switch to preview on larger screens after ready
        if (window.innerWidth >= 1024) {
          setTimeout(() => setViewMode('preview'), 600)
        }
      }
    }, 1100)

    // Initial thinking message
    setMessages((prev) => [
      ...prev,
      { role: 'nyven', content: builderPhases[0].label, thinking: true },
    ])

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
          "I've noted that. In the full version, I'll update the design and code based on your feedback. For now this is a frontend demonstration of the builder experience.",
      },
    ])
  }

  const projectTitle =
    state.type || state.description?.slice(0, 28) || 'Untitled Project'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
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
          {/* Mobile toggle */}
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

          {/* Device toggles - desktop */}
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
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/25 hover:bg-nyven-cyan/25 transition-colors"
            title="Publish (coming soon)"
          >
            <Rocket size={14} />
            <span className="hidden sm:inline">Publish</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Chat panel */}
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

        {/* Preview panel */}
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
                    {builderPhases[phaseIdx]?.label || 'Working...'}
                  </p>
                  <p className="text-sm text-nyven-text-secondary">
                    NYVEN is building your experience
                  </p>
                </div>
                <div className="w-48 h-1 bg-nyven-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-nyven-cyan to-nyven-violet"
                    initial={{ width: '5%' }}
                    animate={{ width: `${((phaseIdx + 1) / builderPhases.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
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
                {/* Mock website preview */}
                <div className="h-full overflow-y-auto bg-[#0a0c10]">
                  <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0d1118]/90 backdrop-blur">
                    <span className="font-display font-medium text-sm">
                      {state.type || 'Your Site'}
                    </span>
                    <div className="flex gap-4 text-xs text-nyven-text-secondary">
                      <span>Home</span>
                      <span>About</span>
                      <span>Contact</span>
                    </div>
                  </div>
                  <div className="px-6 py-16 text-center">
                    <h2 className="font-display text-3xl sm:text-4xl font-medium mb-4">
                      {state.description?.slice(0, 50) || 'Welcome'}
                    </h2>
                    <p className="text-nyven-text-secondary max-w-md mx-auto mb-8 text-sm leading-relaxed">
                      This is a mock preview of the website NYVEN would generate.
                      In the full product, this becomes a live, editable site powered by
                      the real builder pipeline.
                    </p>
                    <div className="inline-flex px-5 py-2.5 rounded-full bg-nyven-cyan/20 text-nyven-cyan text-sm font-medium border border-nyven-cyan/30">
                      Get Started
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 pb-16">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-32 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
