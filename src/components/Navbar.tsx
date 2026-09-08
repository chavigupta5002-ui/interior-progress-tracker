import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CloseIcon, HamburgerIcon, SignOutIcon } from './Icon'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  viewer: 'Viewer',
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
    <header className="navbar">
      <span className="navbar-brand">Interior Progress Tracker</span>

      {session && (
        <button
          type="button"
          className="hamburger-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon width={22} height={22} /> : <HamburgerIcon width={22} height={22} />}
        </button>
      )}

      {menuOpen && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="hamburger-menu">
            <p className="hamburger-menu-brand">Interior Progress Tracker</p>

            {profile && (
              <div className="hamburger-menu-user">
                <span className="navbar-name">{profile.display_name}</span>
                <span className={`role-badge role-${profile.role}`}>
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
              </div>
            )}

            {(isProjectManager || isAdmin) && (
              <nav className="hamburger-menu-links">
                {isProjectManager && (
                  <Link to="/" onClick={() => setMenuOpen(false)}>
                    All Properties
                  </Link>
                )}
                {isAdmin && (
                  <Link to="/admin" onClick={() => setMenuOpen(false)}>
                    Admin
                  </Link>
                )}
              </nav>
            )}

            <button className="btn btn-ghost btn-icon hamburger-signout" onClick={handleSignOut}>
              <SignOutIcon width={16} height={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </header>
  )
}
