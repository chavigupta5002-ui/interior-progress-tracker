import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import type { Entry } from '../types'
import { PhotoUploadForm } from '../components/PhotoUploadForm'
import { TimelineEntry } from '../components/TimelineEntry'
import { ChevronLeft } from 'lucide-react'

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
  if (!isProjectManager) return <Navigate to={`/properties/${propertyId}`} replace />

  return (
    <div>
      <Link
        to={`/properties/${propertyId}`}
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        Back to property
      </Link>

      {propertyLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !property ? (
        <p className="text-sm text-gray-500">Property not found.</p>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold text-gray-900">{property.name}</h1>

          {isProjectManager && <PhotoUploadForm propertyId={property.id} />}

          {entriesLoading ? (
            <p className="text-sm text-gray-500">Loading updates…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {entries.length === 0 ? (
                <p className="py-6 text-sm text-gray-500">No updates yet.</p>
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
