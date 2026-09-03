import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NIdentity } from './NIdentity'
import wordmark from '../assets/nyven-wordmark.png'

interface IntroSequenceProps {
  onComplete: () => void
  isFirstVisit: boolean
}

export function IntroSequence({ onComplete, isFirstVisit }: IntroSequenceProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!isFirstVisit) {
      // Short returning visitor sequence
      const t1 = setTimeout(() => setStage(1), 200)
      const t2 = setTimeout(() => setStage(2), 900)
      const t3 = setTimeout(() => onComplete(), 1400)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }

    // Full first-visit cinematic intro ~3s
    const timers = [
      setTimeout(() => setStage(1), 300),   // wordmark
      setTimeout(() => setStage(2), 1100),  // fade wordmark
      setTimeout(() => setStage(3), 1500),  // N identity
      setTimeout(() => setStage(4), 2000),  // tagline
      setTimeout(() => setStage(5), 2800),  // exit
      setTimeout(() => onComplete(), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [isFirstVisit, onComplete])

  if (!isFirstVisit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-nyven-bg">
        <AnimatePresence>
          {stage < 2 && (
            <motion.div
              key="returning-n"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <NIdentity state="white" size={72} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-nyven-bg overflow-hidden">
      <div className="absolute inset-0 nyven-bg" />

      <AnimatePresence mode="wait">
        {stage === 1 && (
          <motion.img
            key="wordmark"
            src={wordmark}
            alt="NYVEN"
            className="relative z-10 h-8 sm:h-10 w-auto object-contain"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            draggable={false}
          />
        )}

        {stage >= 3 && stage < 5 && (
          <motion.div
            key="n-identity"
            className="relative z-10 flex flex-col items-center gap-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <NIdentity state="identity" size={88} />
            {stage >= 4 && (
              <motion.p
                className="font-display text-lg sm:text-xl text-nyven-text/90 tracking-wide text-center px-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                Intelligence, built for what’s next.
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
