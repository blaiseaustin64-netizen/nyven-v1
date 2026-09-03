import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { NyvenBackground } from './components/NyvenBackground'
import { Sidebar, MobileNavBar, MobileBottomNav } from './components/Sidebar'
import { IntroSequence } from './components/IntroSequence'
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { Build } from './pages/Build'
import { Builder } from './pages/Builder'
import { Projects } from './pages/Projects'
import { NyvenPlus } from './pages/NyvenPlus'
import { Settings } from './pages/Settings'
import { Profile } from './pages/Profile'

const INTRO_KEY = 'nyven_intro_seen'

export default function App() {
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Hide bottom nav on builder for more space
  const hideBottomNav = location.pathname === '/builder'

  if (showIntro) {
    return (
      <>
        <NyvenBackground />
        <IntroSequence onComplete={handleIntroComplete} isFirstVisit={isFirstVisit} />
      </>
    )
  }

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <NyvenBackground />

      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <MobileNavBar onMenuOpen={() => setMobileMenuOpen(true)} />

        <main className={`flex-1 min-h-0 overflow-hidden ${hideBottomNav ? '' : 'pb-14 lg:pb-0'}`}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/build" element={<Build />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/nyven-plus" element={<NyvenPlus />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>

        {!hideBottomNav && <MobileBottomNav />}
      </div>
    </div>
  )
}
