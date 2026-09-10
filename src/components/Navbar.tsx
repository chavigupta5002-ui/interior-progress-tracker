import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, Menu, X } from 'lucide-react'
import logo from '../assets/logo-navbar.png'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  viewer: 'Viewer',
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-yellow-50 text-yellow-700',
  project_manager: 'bg-emerald-50 text-emerald-700',
  viewer: 'bg-gray-100 text-gray-500',
}

export function Navbar() {
  const { profile, signOut, session, isAdmin, isProjectManager } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  async function handleSignOut() {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
      <Link to="/">
        <img src={logo} alt="Ace Stayz" className="h-6 w-auto sm:h-8" />
      </Link>

      {session && (
        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-yellow-100"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      )}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10 bg-black/30" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-16 right-3 z-20 w-64 max-w-[calc(100vw-24px)] rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
            <p className="border-b border-gray-100 pb-3 text-sm font-bold text-gray-900">Ace Stayz</p>

            {profile && (
              <div className="flex items-center justify-between gap-2 pt-3">
                <span className="text-sm font-medium text-gray-700">{profile.display_name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${ROLE_BADGE_CLASSES[profile.role] ?? 'bg-gray-100 text-gray-500'}`}
                >
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
              </div>
            )}

            {(isProjectManager || isAdmin) && (
              <nav className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
                {isProjectManager && (
                  <Link
                    to="/"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    All Properties
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Admin
                  </Link>
                )}
              </nav>
            )}

            <button
              type="button"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-t border-gray-100 pt-3 text-sm font-medium text-gray-500 hover:text-gray-800"
              onClick={handleSignOut}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </header>
  )
}
