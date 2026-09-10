import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Property, PropertyType } from '../types'
import { PROPERTY_TYPE_ICON, PROPERTY_TYPES } from '../lib/propertyTypes'
import { Plus } from 'lucide-react'

export function Properties() {
  const { profile, isProjectManager } = useAuth()
  const isViewer = profile?.role === 'viewer'
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null)
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
    if (!profile || !propertyType) return
    setError(null)
    setSubmitting(true)

    const { error } = await supabase.from('properties').insert({
      name: name.trim(),
      description: description.trim() || null,
      property_type: propertyType,
      created_by: profile.id,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }

    setName('')
    setDescription('')
    setPropertyType(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-900">Properties</h1>
        {isProjectManager && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-[#FFD700] px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? (
              'Cancel'
            ) : (
              <>
                <Plus size={16} />
                New
              </>
            )}
          </button>
        )}
      </div>

      {showForm && (
        <form
          className="mb-5 flex flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
          onSubmit={handleCreate}
        >
          <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Property name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen Reno"
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            />
          </label>
          <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Description (optional)
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2nd floor unit, 123 Main St"
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            />
          </label>

          <div className="mb-4">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Property type</span>
            <div className="grid grid-cols-2 gap-3">
              {PROPERTY_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors ${
                    propertyType === t.value
                      ? 'border-yellow-400 bg-yellow-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="propertyType"
                    value={t.value}
                    checked={propertyType === t.value}
                    onChange={() => setPropertyType(t.value)}
                    required
                    className="sr-only"
                  />
                  <img src={t.icon} alt="" className="h-10 w-10 object-contain" />
                  <span className="text-sm font-medium text-gray-800">{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <button
            className="rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={submitting || !propertyType}
          >
            {submitting ? 'Creating…' : 'Create property'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading properties…</p>
      ) : properties.length === 0 ? (
        <p className="py-6 text-sm text-gray-500">No properties yet.</p>
      ) : isViewer && properties.length === 1 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Link
            to={`/properties/${properties[0].id}`}
            className="flex flex-col items-center gap-3 rounded-2xl bg-[#FFD700] px-12 py-10 shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
          >
            <img
              src={PROPERTY_TYPE_ICON[properties[0].property_type]}
              alt=""
              className="h-16 w-16 object-contain"
            />
            <span className="text-lg font-bold text-black">{properties[0].name}</span>
          </Link>
        </div>
      ) : isViewer ? (
        <div className="grid grid-cols-2 gap-5 py-4 sm:grid-cols-3">
          {properties.map((p) => (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="group flex flex-col items-center gap-2"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-transparent bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] transition-all group-hover:border-yellow-300 group-hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
                <img src={PROPERTY_TYPE_ICON[p.property_type]} alt="" className="h-14 w-14 object-contain" />
              </div>
              <span className="text-center text-sm font-medium text-gray-800">{p.name}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {properties.map((p) => (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-gray-200"
            >
              <div className="flex items-center gap-3">
                <img
                  src={PROPERTY_TYPE_ICON[p.property_type]}
                  alt=""
                  className="h-8 w-8 flex-shrink-0 object-contain"
                />
                <h2 className="min-w-0 truncate text-base font-semibold text-gray-900">{p.name}</h2>
              </div>
              {p.description && <p className="mt-1 text-sm text-gray-600">{p.description}</p>}
              <span className="mt-2 block text-xs font-normal text-gray-400">
                Created {new Date(p.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
