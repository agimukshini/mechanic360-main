import { Outlet } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { Cloud } from 'lucide-react'

export default function DashboardLayout() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved === 'true'
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])
  const openMobileNav = useCallback(() => setMobileNavOpen(true), [])

  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode))
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className={`flex h-screen bg-background relative overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {/* Background Decoration */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-100 blur-[120px]"></div>
      </div>

      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={closeMobileNav} />

      <div className="flex-1 flex flex-col overflow-hidden relative z-10 lg:pl-[200px]">
        <Header
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onOpenMobileNav={openMobileNav}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar min-w-0">
          <div className="page-shell px-4 sm:px-6 lg:px-8 py-4 lg:py-6 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Device Status Footer (Desktop) */}
        <footer className="hidden lg:flex fixed bottom-0 left-[200px] right-0 py-3 px-6 items-center justify-between text-xs font-medium text-gray-500 z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-100 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-success"></div>
            <span>System Online</span>
          </div>
          <div className="bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-100 pointer-events-auto flex items-center gap-2">
            <Cloud className="w-3 h-3 text-gray-400" />
            <span>Last synced: Just now</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
