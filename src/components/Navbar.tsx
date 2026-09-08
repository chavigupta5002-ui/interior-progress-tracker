import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ReportIcon, SignOutIcon } from './Icon'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  viewer: 'Viewer',
}

export function Navbar() {
  const { profile, signOut, session, isAdmin } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        Interior Progress Tracker
      </Link>
      {session && (
        <nav className="navbar-links">
          <Link to="/">Properties</Link>
          <Link to="/reports" className="icon-link">
            <ReportIcon width={16} height={16} />
            Reports
          </Link>
          {isAdmin && <Link to="/admin">Admin</Link>}
        </nav>
      )}
      <div className="navbar-user">
        {profile && (
          <>
            <span className="navbar-name">
              {profile.display_name}
              <span className={`role-badge role-${profile.role}`}>
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
            </span>
            <button className="btn btn-ghost btn-icon" onClick={handleSignOut}>
              <SignOutIcon width={16} height={16} />
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  )
}
