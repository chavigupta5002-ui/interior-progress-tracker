import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const inputClass =
  'h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none'

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
    <div className="flex justify-center py-6">
      <form
        className="w-full rounded-2xl border border-gray-100 bg-white p-7 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
        onSubmit={handleSubmit}
      >
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Create account</h1>
        <p className="mb-5 text-sm text-gray-500">
          Your display name will be stamped on every entry you create.
        </p>

        <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Display name
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Rahul"
            className={inputClass}
          />
        </label>

        <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>

        <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className={inputClass}
          />
        </label>

        <p className="mb-4 text-sm text-gray-500">
          New accounts start as viewers. Ask an admin to grant you project manager access or share
          properties with you.
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {info && <p className="mb-4 text-sm text-emerald-700">{info}</p>}

        <button
          className="w-full rounded-xl bg-[#FFD700] py-3.5 text-center text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-gray-800 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}
