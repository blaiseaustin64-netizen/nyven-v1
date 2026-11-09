import { useState, useEffect } from 'react'
import { useKeyboardOpen } from './hooks/useKeyboardOpen'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { NyvenBackground } from './components/NyvenBackground'
import { Sidebar, MobileNavBar } from './components/Sidebar'
import { IntroSequence } from './components/IntroSequence'
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { Build } from './pages/Build'
import { Builder } from './pages/Builder'
import { Projects } from './pages/Projects'
import { ProjectCreate } from './pages/projects/ProjectCreate'
import { ProjectWorkspace } from './pages/projects/ProjectWorkspace'
import { NyvenPlus } from './pages/NyvenPlus'
import { Settings } from './pages/Settings'
import { Profile } from './pages/Profile'
import { Preview } from './pages/Preview'
import { Agents } from './pages/Agents'
import { AgentEditor } from './pages/AgentEditor'
import { Auth } from './pages/Auth'
import { AuthProvider } from './lib/auth/AuthContext'
import { ConversationHistoryProvider } from './lib/chat/ConversationHistoryContext'

const INTRO_KEY = 'nyven_intro_seen'

/** NYVEN Code has its own workspace; the generic Create Agent form redirects it there. */
function CreateAgentRoute() {
  const [params] = useSearchParams()
  if (params.get('type') === 'code') return <Navigate to="/projects" replace />
  return <AgentEditor />
}

export default function App() {
  const keyboardOpen = useKeyboardOpen()
  const [showIntro, setShowIntro] = useState(true)
  const [isFirstVisit, setIsFirstVisit] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const seen = localStorage.getItem(INTRO_KEY)
    if (seen) {
      setIsFirstVisit(false)
    }
  }, [])

  const handleIntroComplete = () => {
    setShowIntro(false)
    localStorage.setItem(INTRO_KEY, '1')
  }

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const open = () => setMobileMenuOpen(true)
    window.addEventListener('nyven-open-menu', open)
    return () => window.removeEventListener('nyven-open-menu', open)
  }, [])

  // Phase 7: swipe from left edge to open the mobile drawer
  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    const onStart = (e: TouchEvent) => {
      if (window.matchMedia('(min-width: 1024px)').matches) return
      const t = e.touches[0]
      if (t.clientX <= 24) {
        startX = t.clientX
        startY = t.clientY
        tracking = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (dx > 56 && dy < 40) {
        setMobileMenuOpen(true)
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])

  if (showIntro) {
    return (
      <>
        <NyvenBackground />
        <IntroSequence onComplete={handleIntroComplete} isFirstVisit={isFirstVisit} />
      </>
    )
  }

  // Full-page auth (landing-style) — no sidebar chrome
  if (location.pathname === '/auth') {
    return (
      <AuthProvider>
        <div className="h-full overflow-y-auto">
          <Auth />
        </div>
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
    <ConversationHistoryProvider>
    <div className="h-full max-h-[100dvh] flex flex-col lg:flex-row min-w-0 overflow-hidden">
      <NyvenBackground />

      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {!location.pathname.startsWith('/chat') && !location.pathname.startsWith('/projects') && (
          <MobileNavBar onMenuOpen={() => setMobileMenuOpen(true)} />
        )}

        <main className="flex-1 min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/build" element={<Build />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<ProjectCreate />} />
            <Route path="/projects/:projectId" element={<ProjectWorkspace />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/create" element={<CreateAgentRoute />} />
            <Route path="/code" element={<Navigate to="/chat" replace />} />
            <Route path="/agents/:id" element={<AgentEditor />} />
            <Route path="/nyven-plus" element={<NyvenPlus />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/preview/:slug" element={<Preview />} />
          </Routes>
        </main>

        
      </div>
    </div>
    </ConversationHistoryProvider>
    </AuthProvider>
  )
}
