import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry, Property } from '../types'
import { PhotoUploadForm } from '../components/PhotoUploadForm'
import { TimelineEntry } from '../components/TimelineEntry'
import { BackArrowIcon, ReportIcon } from '../components/Icon'

export function PropertyDetail() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { isProjectManager } = useAuth()
  const [property, setProperty] = useState<Property | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

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
            <Link to={`/reports?propertyId=${property.id}`} className="btn btn-ghost btn-icon">
              <ReportIcon width={16} height={16} />
              View report
            </Link>
          </div>

          {isProjectManager && <PhotoUploadForm propertyId={property.id} />}

          <div className="timeline">
            {entries.length === 0 ? (
              <p className="empty-state">No updates yet.</p>
            ) : (
              entries.map((entry) => <TimelineEntry key={entry.id} entry={entry} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}
