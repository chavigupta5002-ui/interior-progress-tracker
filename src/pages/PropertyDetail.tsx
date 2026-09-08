import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry, Property } from '../types'
import { PhotoUploadForm } from '../components/PhotoUploadForm'
import { TimelineEntry } from '../components/TimelineEntry'
import { ScopeChecklist } from '../components/ScopeChecklist'
import { BackArrowIcon, ReportIcon, TrashIcon } from '../components/Icon'

export function PropertyDetail() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const { isProjectManager, isAdmin } = useAuth()
  const [property, setProperty] = useState<Property | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingProperty, setDeletingProperty] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let mounted = true

    async function load() {
      const [{ data: propertyData }, { data: entryData }] = await Promise.all([
        supabase.from('properties').select('*').eq('id', propertyId).single(),
        supabase
          .from('entries')
          .select('*')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false }),
      ])
      if (!mounted) return
      setProperty(propertyData ?? null)
      setEntries(entryData ?? [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel(`entries-${propertyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'entries', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const newEntry = payload.new as Entry
          setEntries((prev) => (prev.some((e) => e.id === newEntry.id) ? prev : [newEntry, ...prev]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'entries', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const oldId = (payload.old as Entry).id
          setEntries((prev) => prev.filter((e) => e.id !== oldId))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [propertyId])

  async function handleDeleteProperty() {
    if (!property) return
    const ok = window.confirm(
      `Delete "${property.name}" and all ${entries.length} of its ${entries.length === 1 ? 'entry' : 'entries'}? This cannot be undone.`
    )
    if (!ok) return
    setDeletingProperty(true)
    setDeleteError(null)

    const { error } = await supabase.from('properties').delete().eq('id', property.id)
    if (error) {
      setDeleteError(error.message)
      setDeletingProperty(false)
      return
    }

    const allPhotoPaths = entries.flatMap((e) => e.photo_paths ?? [])
    if (allPhotoPaths.length > 0) {
      await supabase.storage.from(PHOTOS_BUCKET).remove(allPhotoPaths)
    }

    navigate('/')
  }

  if (!propertyId) return null

  return (
    <div className="page">
      <Link to="/" className="back-link icon-link">
        <BackArrowIcon width={16} height={16} />
        All properties
      </Link>

      {loading ? (
        <p>Loading…</p>
      ) : !property ? (
        <p>Property not found.</p>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1>{property.name}</h1>
              {property.description && <p className="property-description">{property.description}</p>}
            </div>
            <div className="page-header-actions">
              <Link to={`/reports?propertyId=${property.id}`} className="btn btn-ghost btn-icon">
                <ReportIcon width={16} height={16} />
                View report
              </Link>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-danger"
                  onClick={handleDeleteProperty}
                  disabled={deletingProperty}
                >
                  <TrashIcon width={16} height={16} />
                  {deletingProperty ? 'Deleting…' : 'Delete property'}
                </button>
              )}
            </div>
          </div>

          {deleteError && <p className="form-error">{deleteError}</p>}

          <ScopeChecklist propertyId={property.id} propertyName={property.name} />

          {isProjectManager && <PhotoUploadForm propertyId={property.id} />}

          <div className="timeline">
            {entries.length === 0 ? (
              <p className="empty-state">No updates yet.</p>
            ) : (
              entries.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  onUpdated={(updated) =>
                    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                  }
                  onDeleted={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
