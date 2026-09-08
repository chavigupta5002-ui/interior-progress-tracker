import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Property } from '../types'
import { PlusIcon } from '../components/Icon'

export function Properties() {
  const { profile, isProjectManager } = useAuth()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadProperties() {
    setLoading(true)
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setProperties(data)
    setLoading(false)
  }

  useEffect(() => {
    loadProperties()

    const channel = supabase
      .channel('properties-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'properties' },
        (payload) => {
          setProperties((prev) => [payload.new as Property, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    setSubmitting(true)

    const { error } = await supabase.from('properties').insert({
      name: name.trim(),
      description: description.trim() || null,
      created_by: profile.id,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }

    setName('')
    setDescription('')
    setShowForm(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Properties</h1>
        {isProjectManager && (
          <button className="btn btn-primary btn-icon" onClick={() => setShowForm((v) => !v)}>
            {showForm ? (
              'Cancel'
            ) : (
              <>
                <PlusIcon width={16} height={16} />
                New property
              </>
            )}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card form-inline" onSubmit={handleCreate}>
          <label>
            Property name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen Reno"
            />
          </label>
          <label>
            Description (optional)
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2nd floor unit, 123 Main St"
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create property'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Loading properties…</p>
      ) : properties.length === 0 ? (
        <p className="empty-state">No properties yet.</p>
      ) : (
        <div className="property-grid">
          {properties.map((p) => (
            <Link key={p.id} to={`/properties/${p.id}`} className="card property-card">
              <h2>{p.name}</h2>
              {p.description && <p className="property-description">{p.description}</p>}
              <span className="property-meta">
                Created {new Date(p.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
