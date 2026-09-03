import { NIdentity } from '../components/NIdentity'
import { useNavigate } from 'react-router-dom'

export function Profile() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-nyven-surface border border-white/[0.08] mb-5">
          <NIdentity state="white" size={40} />
        </div>
        <h1 className="font-display text-xl font-medium mb-1">Guest</h1>
        <p className="text-sm text-nyven-text-secondary mb-8">
          Sign-in will be available in a later release
        </p>

        <div className="bg-nyven-surface border border-white/[0.06] rounded-2xl p-5 text-left space-y-4 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-nyven-text-secondary">Plan</span>
            <span>Free</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-nyven-text-secondary">Projects</span>
            <span>4 (demo)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-nyven-text-secondary">Member since</span>
            <span>—</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="w-full py-2.5 rounded-xl bg-nyven-surface border border-white/[0.06] text-sm font-medium hover:bg-white/[0.05] transition-colors"
          >
            Settings
          </button>
          <button
            onClick={() => navigate('/nyven-plus')}
            className="w-full py-2.5 rounded-xl bg-nyven-cyan/15 text-nyven-cyan text-sm font-medium border border-nyven-cyan/25 hover:bg-nyven-cyan/25 transition-colors"
          >
            Explore NYVEN+
          </button>
        </div>
      </div>
    </div>
  )
}
