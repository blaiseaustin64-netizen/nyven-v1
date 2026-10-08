/**
 * Deprecated — Build is no longer part of the primary NYVEN product.
 * Route kept for old bookmarks; redirects to Chat.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function Build() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/chat', { replace: true })
  }, [navigate])
  return (
    <div className="h-full flex items-center justify-center text-sm text-nyven-text-secondary">
      Build has moved. Redirecting to Chat…
    </div>
  )
}
