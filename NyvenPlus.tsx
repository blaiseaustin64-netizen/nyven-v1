import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { NIdentity } from '../components/NIdentity'

const freeFeatures = [
  'Core chat with NYVEN',
  'Basic website building',
  'Limited projects',
  'Standard response speed',
]

const plusFeatures = [
  'Everything in Free',
  'Advanced building & longer context',
  'Priority generation',
  'Unlimited projects',
  'Early access to new capabilities',
  'Enhanced creative tools',
]

export function NyvenPlus() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center mb-5">
            <NIdentity state="identity" size={56} />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mb-3">
            NYVEN+
          </h1>
          <p className="text-nyven-text-secondary text-lg max-w-md mx-auto">
            More intelligence. More creation. More possibilities.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-6 sm:p-7"
          >
            <h2 className="font-display text-xl font-medium mb-1">Free</h2>
            <p className="text-nyven-text-secondary text-sm mb-6">
              Start exploring with NYVEN
            </p>
            <ul className="space-y-3 mb-8">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={16} className="text-nyven-text-secondary shrink-0 mt-0.5" />
                  <span className="text-nyven-text-secondary">{f}</span>
                </li>
              ))}
            </ul>
            <button className="w-full py-3 rounded-xl border border-white/[0.1] text-sm font-medium text-nyven-text-secondary cursor-default">
              Current plan
            </button>
          </motion.div>

          {/* Plus */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative bg-nyven-surface border border-nyven-cyan/25 rounded-2xl p-6 sm:p-7 shadow-nyven"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-nyven-cyan/20 border border-nyven-cyan/30 text-[11px] font-medium text-nyven-cyan flex items-center gap-1">
              <Sparkles size={11} />
              Recommended
            </div>
            <h2 className="font-display text-xl font-medium mb-1">NYVEN+</h2>
            <p className="text-nyven-text-secondary text-sm mb-6">
              Unlock the full creative platform
            </p>
            <ul className="space-y-3 mb-8">
              {plusFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={16} className="text-nyven-cyan shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              className="w-full py-3 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium hover:bg-nyven-cyan/90 transition-colors"
              title="Payments coming in a later phase"
            >
              Upgrade (coming soon)
            </button>
            <p className="text-center text-[11px] text-nyven-text-secondary/60 mt-3">
              Pricing and payments will be available in a future release
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
