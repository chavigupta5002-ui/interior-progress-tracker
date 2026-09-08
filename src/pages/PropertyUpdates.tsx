import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import type { Entry } from '../types'
import { PhotoUploadForm } from '../components/PhotoUploadForm'
import { TimelineEntry } from '../components/TimelineEntry'
import { BackArrowIcon } from '../components/Icon'

export function PropertyUpdates() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { isProjectManager } = useAuth()
  const { property, loading: propertyLoading } = useProperty(propertyId)
  const [entries, setEntries] = useState<Entry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)

  useEffect(() => {
    if (!propertyId) return
    let mounted = true

    supabase
      .from('entries')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!mounted) return
        setEntries(data ?? [])
        setEntriesLoading(false)
      })

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

  if (!propertyId) return null

  return (
    <div className="page">
      <Link to={`/properties/${propertyId}`} className="back-link icon-link">
        <BackArrowIcon width={16} height={16} />
        Back to property
      </Link>

      {propertyLoading ? (
        <p>Loading…</p>
      ) : !property ? (
        <p>Property not found.</p>
      ) : (
        <>
          <h1>{property.name}</h1>

          {isProjectManager && <PhotoUploadForm propertyId={property.id} />}

          {entriesLoading ? (
            <p>Loading updates…</p>
          ) : (
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
          )}
        </>
      )}
    </div>
  )
}
