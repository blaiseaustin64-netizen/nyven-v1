import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const websiteTypes = ['Landing page', 'Portfolio', 'Restaurant', 'SaaS', 'E-commerce', 'Blog', 'Other']
const styles = ['Minimal', 'Luxury', 'Modern', 'Playful', 'Corporate', 'Creative']
const features = ['Contact form', 'Booking', 'Gallery', 'Pricing table', 'Blog', 'Shop']

export function Build() {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [style, setStyle] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])

  const toggleFeature = (f: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    )
  }

  const handleBuild = () => {
    if (!description.trim()) return
    navigate('/builder', {
      state: {
        description: description.trim(),
        type,
        style,
        features: selectedFeatures,
      },
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-display text-2xl sm:text-3xl font-medium mb-2">
            Build with NYVEN
          </h1>
          <p className="text-nyven-text-secondary mb-8">
            Tell me what you want to create.
          </p>

          {/* Description */}
          <label className="block mb-6">
            <span className="text-sm font-medium text-nyven-text-secondary mb-2 block">
              Website description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the website you want NYVEN to build..."
              rows={5}
              className="w-full bg-nyven-surface border border-white/[0.08] rounded-2xl px-4 py-3.5 text-[15px] text-nyven-text placeholder:text-nyven-text-secondary/60 focus:outline-none focus:border-nyven-cyan/30 resize-none transition-colors"
            />
          </label>

          {/* Type */}
          <div className="mb-6">
            <span className="text-sm font-medium text-nyven-text-secondary mb-2.5 block">
              Website type
            </span>
            <div className="flex flex-wrap gap-2">
              {websiteTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3.5 py-2 rounded-full text-sm transition-all ${
                    type === t
                      ? 'bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/30'
                      : 'bg-nyven-surface border border-white/[0.06] text-nyven-text-secondary hover:text-nyven-text'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="mb-6">
            <span className="text-sm font-medium text-nyven-text-secondary mb-2.5 block">
              Style
            </span>
            <div className="flex flex-wrap gap-2">
              {styles.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`px-3.5 py-2 rounded-full text-sm transition-all ${
                    style === s
                      ? 'bg-nyven-violet/15 text-nyven-violet border border-nyven-violet/30'
                      : 'bg-nyven-surface border border-white/[0.06] text-nyven-text-secondary hover:text-nyven-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="mb-10">
            <span className="text-sm font-medium text-nyven-text-secondary mb-2.5 block">
              Features (optional)
            </span>
            <div className="flex flex-wrap gap-2">
              {features.map((f) => (
                <button
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`px-3.5 py-2 rounded-full text-sm transition-all ${
                    selectedFeatures.includes(f)
                      ? 'bg-nyven-cyan/15 text-nyven-cyan border border-nyven-cyan/30'
                      : 'bg-nyven-surface border border-white/[0.06] text-nyven-text-secondary hover:text-nyven-text'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleBuild}
            disabled={!description.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-nyven-cyan text-nyven-bg font-medium text-[15px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-nyven-cyan/90 transition-colors"
          >
            Build Website
            <ArrowRight size={18} />
          </button>
        </motion.div>
      </div>
    </div>
  )
          }
