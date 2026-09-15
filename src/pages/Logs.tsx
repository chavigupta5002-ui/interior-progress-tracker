import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatActivityLogLine } from '../lib/formatActivityLog'
import type { ActivityAction, ActivityLog, Profile, Property, ScopeItem } from '../types'

const ACTION_LABELS: Record<ActivityAction, string> = {
  item_checked: 'Checked off',
  item_unchecked: 'Unchecked',
  item_assigned: 'Assigned',
  item_unassigned: 'Unassigned',
  item_deleted: 'Deleted',
  entry_created: 'Update added',
}

const selectClass =
  'h-10 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none'

const LOG_LIMIT = 300

export function Logs() {
  const { isAdmin } = useAuth()

  const [properties, setProperties] = useState<Property[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([])
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [propertyFilter, setPropertyFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState<'all' | ActivityAction>('all')

  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('properties')
      .select('*')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
    supabase
      .from('profiles')
      .select('*')
      .order('display_name')
      .then(({ data }) => setProfiles(data ?? []))
    supabase
      .from('scope_items')
      .select('*')
      .then(({ data }) => setScopeItems(data ?? []))
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true
    setLoading(true)
    setError(null)

    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LOG_LIMIT)

    if (propertyFilter !== 'all') query = query.eq('property_id', propertyFilter)
    if (actorFilter !== 'all') query = query.eq('actor_id', actorFilter)
    if (actionFilter !== 'all') query = query.eq('action', actionFilter)

    query.then(({ data, error: fetchError }) => {
      if (!mounted) return
      if (fetchError) setError(fetchError.message)
      setLogs(data ?? [])
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [isAdmin, propertyFilter, actorFilter, actionFilter])

  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const propertiesById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])
  const itemsById = useMemo(() => new Map(scopeItems.map((i) => [i.id, i])), [scopeItems])

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div>
      <h1 className="mb-5 text-3xl font-bold text-gray-900">Logs</h1>

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] sm:flex-row sm:flex-wrap">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
          Property
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className={selectClass}>
            <option value="all">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
          Actor
          <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className={selectClass}>
            <option value="all">All people</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
          Action
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | ActivityAction)}
            className={selectClass}
          >
            <option value="all">All actions</option>
            {(Object.keys(ACTION_LABELS) as ActivityAction[]).map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="py-6 text-sm text-gray-500">No activity found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-gray-100 bg-white p-3 text-sm text-gray-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
            >
              {formatActivityLogLine(log, { profilesById, propertiesById, itemsById })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
