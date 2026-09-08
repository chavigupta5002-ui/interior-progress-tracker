import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    // New accounts always start as 'viewer' — an admin grants
    // project_manager access afterwards (see profiles RLS policies).
    const { error } = await signUp(email.trim(), password, displayName.trim(), 'viewer')

    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }

    // If Supabase email confirmation is enabled, there won't be a session yet.
    setInfo('Account created. If email confirmation is enabled, check your inbox before logging in.')
    setTimeout(() => navigate('/'), 1200)
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Create account</h1>
        <p className="auth-subtitle">
          Your display name will be stamped on every entry you create.
        </p>

        <label>
          Display name
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Rahul"
          />
        </label>

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>

        <p className="auth-subtitle">
          New accounts start as viewers. Ask an admin to grant you project
          manager access or share properties with you.
        </p>

        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  )
}
