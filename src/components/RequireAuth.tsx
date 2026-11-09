import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'

/** Blocks guests from signed-in-only routes (Projects). */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-nyven-text-secondary">
        Loading…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
