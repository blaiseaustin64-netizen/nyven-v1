import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, Hammer, Sparkles, Code2, ArrowRight } from 'lucide-react'
import wordmark from '../assets/nyven-wordmark.png'
import { MessageComposer } from '../components/MessageComposer'

const quickActions = [
  { id: 'ask', label: 'Ask', icon: MessageSquare, path: '/chat', prompt: '' },
  { id: 'build', label: 'Build', icon: Hammer, path: '/build', prompt: '' },
  { id: 'create', label: 'Create', icon: Sparkles, path: '/chat', prompt: 'Help me create something new' },
  { id: 'code', label: 'Code', icon: Code2, path: '/chat', prompt: 'I need help with code' },
]

export function Home() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')

  const handleSend = (text: string) => {
    // Navigate to chat with the message (mock)
    navigate('/chat', { state: { initialMessage: text } })
  }

  const handleQuick = (path: string, prompt?: string) => {
    if (prompt) {
      navigate(path, { state: { initialMessage: prompt } })
    } else {
      navigate(path)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
        <motion.div
          className="w-full max-w-2xl flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <img
            src={wordmark}
            alt="NYVEN"
            className="h-7 sm:h-9 w-auto mb-5 object-contain"
            draggable={false}
          />

          <p className="font-display text-lg sm:text-xl text-nyven-text-secondary tracking-wide mb-10 sm:mb-12">
            Intelligence, built for what’s next.
          </p>

          <h1 className="font-display text-2xl sm:text-3xl md:text-[2rem] font-medium text-nyven-text mb-8 leading-snug">
            What can I help you create today?
          </h1>

          {/* Central input */}
          <div className="w-full mb-8">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && input.trim()) {
                    handleSend(input.trim())
                  }
                }}
                placeholder="Ask NYVEN anything..."
                className="w-full bg-nyven-surface border border-white/[0.08] rounded-2xl px-5 py-4 pr-14 text-[15px] sm:text-base text-nyven-text placeholder:text-nyven-text-secondary/60 focus:outline-none focus:border-nyven-cyan/35 transition-colors"
              />
              <button
                onClick={() => input.trim() && handleSend(input.trim())}
                disabled={!input.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-nyven-cyan text-nyven-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-nyven-cyan/90 transition-colors"
                aria-label="Send"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            {quickActions.map(({ id, label, icon: Icon, path, prompt }) => (
              <button
                key={id}
                onClick={() => handleQuick(path, prompt)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-nyven-surface/80 border border-white/[0.06] text-sm font-medium text-nyven-text-secondary hover:text-nyven-text hover:border-nyven-cyan/25 hover:bg-nyven-surface transition-all duration-200"
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
