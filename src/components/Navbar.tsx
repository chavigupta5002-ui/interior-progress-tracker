import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Navbar() {
  const { profile, signOut, session } = useAuth()
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
          <Link to="/reports">Reports</Link>
        </nav>
      )}
      <div className="navbar-user">
        {profile && (
          <>
            <span className="navbar-name">
              {profile.display_name}
              <span className={`role-badge role-${profile.role}`}>
                {profile.role === 'project_manager' ? 'Project Manager' : 'Viewer'}
              </span>
            </span>
            <button className="btn btn-ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  )
}
