import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Profile, ScopeHeader, ScopePoint } from '../types'
import { ProgressBar } from './ProgressBar'
import { CongratsModal } from './CongratsModal'
import { PlusIcon, TrashIcon } from './Icon'
import { formatPercent } from '../lib/progress'

function formatCheckedMeta(point: ScopePoint, nameById: Map<string, string>) {
  if (!point.checked_at) return null
  const name = point.checked_by ? nameById.get(point.checked_by) ?? 'Someone' : 'Someone'
  const when = new Date(point.checked_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Checked by ${name} · ${when}`
}

export function ScopeChecklist({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const { profile, isProjectManager } = useAuth()
  const canManage = isProjectManager // true for admins too, see AuthContext

  const [headers, setHeaders] = useState<ScopeHeader[]>([])
  const [points, setPoints] = useState<ScopePoint[]>([])
  const [nameById, setNameById] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newHeaderTitle, setNewHeaderTitle] = useState('')
  const [addingHeader, setAddingHeader] = useState(false)
  const [newPointTitleByHeader, setNewPointTitleByHeader] = useState<Record<string, string>>({})
  const [addingPointFor, setAddingPointFor] = useState<string | null>(null)

  const [showCongrats, setShowCongrats] = useState(false)
  const initializedRef = useRef(false)
  const prevAllCheckedRef = useRef(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      const [{ data: headerData, error: headerError }, { data: pointData, error: pointError }, { data: profileData }] =
        await Promise.all([
          supabase.from('scope_headers').select('*').eq('property_id', propertyId).order('position'),
          supabase.from('scope_points').select('*').eq('property_id', propertyId).order('position'),
          supabase.from('profiles').select('id, display_name'),
        ])
      if (!mounted) return
      if (headerError) setError(headerError.message)
      else if (pointError) setError(pointError.message)
      setHeaders(headerData ?? [])
      setPoints(pointData ?? [])
      setNameById(new Map((profileData ?? []).map((p: Pick<Profile, 'id' | 'display_name'>) => [p.id, p.display_name])))
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel(`scope-${propertyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scope_headers', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const row = payload.new as ScopeHeader
          setHeaders((prev) => (prev.some((h) => h.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'scope_headers', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const oldId = (payload.old as ScopeHeader).id
          setHeaders((prev) => prev.filter((h) => h.id !== oldId))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scope_points', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const row = payload.new as ScopePoint
          setPoints((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scope_points', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const row = payload.new as ScopePoint
          setPoints((prev) => prev.map((p) => (p.id === row.id ? row : p)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'scope_points', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const oldId = (payload.old as ScopePoint).id
          setPoints((prev) => prev.filter((p) => p.id !== oldId))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [propertyId])

  const orderedHeaders = useMemo(() => [...headers].sort((a, b) => a.position - b.position), [headers])
  const pointsByHeader = useMemo(() => {
    const map = new Map<string, ScopePoint[]>()
    for (const point of points) {
      const list = map.get(point.header_id) ?? []
      list.push(point)
      map.set(point.header_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [points])

  const totalPoints = points.length
  const checkedCount = points.filter((p) => p.checked_at).length
  const percent = totalPoints === 0 ? 0 : (checkedCount / totalPoints) * 100

  useEffect(() => {
    if (loading) return
    if (totalPoints === 0) {
      initializedRef.current = false
      return
    }
    const allChecked = checkedCount === totalPoints
    if (!initializedRef.current) {
      initializedRef.current = true
      prevAllCheckedRef.current = allChecked
      return
    }
    if (allChecked && !prevAllCheckedRef.current) {
      setShowCongrats(true)
    }
    prevAllCheckedRef.current = allChecked
  }, [loading, checkedCount, totalPoints])

  async function handleAddHeader(e: FormEvent) {
    e.preventDefault()
    const title = newHeaderTitle.trim()
    if (!title || !profile) return
    setAddingHeader(true)
    setError(null)
    const { error: insertError } = await supabase.from('scope_headers').insert({
      property_id: propertyId,
      title,
      position: orderedHeaders.length,
      created_by: profile.id,
    })
    setAddingHeader(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewHeaderTitle('')
  }

  async function handleDeleteHeader(header: ScopeHeader) {
    const count = pointsByHeader.get(header.id)?.length ?? 0
    const ok = window.confirm(
      `Delete "${header.title}"${count > 0 ? ` and its ${count} checklist point${count === 1 ? '' : 's'}` : ''}? This cannot be undone.`
    )
    if (!ok) return
    setError(null)
    const { data: deletedRows, error: deleteError } = await supabase
      .from('scope_headers')
      .delete()
      .eq('id', header.id)
      .select('id')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Nothing was deleted — you may not have permission to delete this header.')
      return
    }
    setHeaders((prev) => prev.filter((h) => h.id !== header.id))
    setPoints((prev) => prev.filter((p) => p.header_id !== header.id))
  }

  async function handleAddPoint(e: FormEvent, header: ScopeHeader) {
    e.preventDefault()
    const title = (newPointTitleByHeader[header.id] ?? '').trim()
    if (!title || !profile) return
    setAddingPointFor(header.id)
    setError(null)
    const { error: insertError } = await supabase.from('scope_points').insert({
      header_id: header.id,
      property_id: propertyId,
      title,
      position: pointsByHeader.get(header.id)?.length ?? 0,
      created_by: profile.id,
    })
    setAddingPointFor(null)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewPointTitleByHeader((prev) => ({ ...prev, [header.id]: '' }))
  }

  async function handleDeletePoint(point: ScopePoint) {
    const ok = window.confirm(`Delete "${point.title}"? This cannot be undone.`)
    if (!ok) return
    setError(null)
    const { data: deletedRows, error: deleteError } = await supabase
      .from('scope_points')
      .delete()
      .eq('id', point.id)
      .select('id')
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Nothing was deleted — you may not have permission to delete this point.')
      return
    }
    setPoints((prev) => prev.filter((p) => p.id !== point.id))
  }

  async function handleToggle(point: ScopePoint) {
    if (!profile) return
    const checking = !point.checked_at
    const patch = checking
      ? { checked_by: profile.id, checked_at: new Date().toISOString() }
      : { checked_by: null, checked_at: null }
    const prevPoints = points
    setPoints((prev) => prev.map((p) => (p.id === point.id ? { ...p, ...patch } : p)))
    const { error: updateError } = await supabase.from('scope_points').update(patch).eq('id', point.id)
    if (updateError) {
      setPoints(prevPoints)
      setError(updateError.message)
    }
  }

  if (loading) return <p>Loading scope of work…</p>

  return (
    <section className="card scope-checklist">
      <h2>Scope of Work</h2>
      <ProgressBar percent={percent} label="Overall progress" />
      {error && <p className="form-error">{error}</p>}

      {orderedHeaders.length === 0 ? (
        <p className="empty-state">
          {canManage ? 'No checklist yet — add a header to get started.' : 'No scope of work defined yet.'}
        </p>
      ) : (
        <div className="scope-headers">
          {orderedHeaders.map((header) => {
            const headerPoints = pointsByHeader.get(header.id) ?? []
            const headerWeight = totalPoints === 0 ? 0 : (headerPoints.length / totalPoints) * 100
            return (
              <details key={header.id} className="scope-header">
                <summary>
                  <span className="scope-header-title">{header.title}</span>
                  <span className="scope-header-weight">
                    {formatPercent(headerWeight)}% of total
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-danger scope-header-delete"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDeleteHeader(header)
                      }}
                      aria-label={`Delete ${header.title}`}
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  )}
                </summary>

                <ul className="scope-points">
                  {headerPoints.map((point) => (
                    <li key={point.id} className="scope-point">
                      <label className="scope-point-label">
                        <input
                          type="checkbox"
                          checked={!!point.checked_at}
                          disabled={!canManage}
                          onChange={() => handleToggle(point)}
                        />
                        <span className={point.checked_at ? 'scope-point-title checked' : 'scope-point-title'}>
                          {point.title}
                        </span>
                      </label>
                      {point.checked_at && (
                        <span className="scope-point-meta">{formatCheckedMeta(point, nameById)}</span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-danger scope-point-delete"
                          onClick={() => handleDeletePoint(point)}
                          aria-label={`Delete ${point.title}`}
                        >
                          <TrashIcon width={12} height={12} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {canManage && (
                  <form
                    className="scope-add-point-form"
                    onSubmit={(e) => handleAddPoint(e, header)}
                  >
                    <input
                      type="text"
                      placeholder="Add a checklist point…"
                      value={newPointTitleByHeader[header.id] ?? ''}
                      onChange={(e) =>
                        setNewPointTitleByHeader((prev) => ({ ...prev, [header.id]: e.target.value }))
                      }
                    />
                    <button
                      type="submit"
                      className="btn btn-ghost btn-icon"
                      disabled={addingPointFor === header.id || !(newPointTitleByHeader[header.id] ?? '').trim()}
                    >
                      <PlusIcon width={14} height={14} />
                      Add
                    </button>
                  </form>
                )}
              </details>
            )
          })}
        </div>
      )}

      {canManage && (
        <form className="scope-add-header-form" onSubmit={handleAddHeader}>
          <input
            type="text"
            placeholder="New header, e.g. Electrical"
            value={newHeaderTitle}
            onChange={(e) => setNewHeaderTitle(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-icon" disabled={addingHeader || !newHeaderTitle.trim()}>
            <PlusIcon width={14} height={14} />
            Add header
          </button>
        </form>
      )}

      {showCongrats && <CongratsModal propertyName={propertyName} onClose={() => setShowCongrats(false)} />}
    </section>
  )
}
