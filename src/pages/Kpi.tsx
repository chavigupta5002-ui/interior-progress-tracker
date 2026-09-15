import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useManagerProfiles } from '../hooks/useManagerProfiles'
import { buildItemIndex, getTopLevelAncestor } from '../lib/scopeProgress'
import { toggleScopeItemChecked } from '../lib/scopeActions'
import type { Property, ScopeItem, ScopeItemAssignment } from '../types'
import { ChevronRight } from 'lucide-react'

const DONE_COLOR = '#059669' // emerald-600
const PENDING_COLOR = '#e5e7eb' // gray-200

interface HeaderGroup {
  taskId: string
  taskTitle: string
  items: ScopeItem[]
}

interface PropertyGroup {
  propertyId: string
  propertyName: string
  headerGroups: HeaderGroup[]
}

function buildPendingGroups(
  pendingItems: ScopeItem[],
  itemsById: Map<string, ScopeItem>,
  propertyById: Map<string, Property>
): PropertyGroup[] {
  const byProperty = new Map<string, ScopeItem[]>()
  for (const item of pendingItems) {
    const list = byProperty.get(item.property_id) ?? []
    list.push(item)
    byProperty.set(item.property_id, list)
  }

  return [...byProperty.entries()].map(([propertyId, propertyItems]) => {
    const byTask = new Map<string, ScopeItem[]>()
    for (const item of propertyItems) {
      const task = getTopLevelAncestor(item, itemsById)
      const list = byTask.get(task.id) ?? []
      list.push(item)
      byTask.set(task.id, list)
    }
    const headerGroups: HeaderGroup[] = [...byTask.entries()].map(([taskId, taskItems]) => ({
      taskId,
      taskTitle: itemsById.get(taskId)?.title ?? 'Untitled',
      items: taskItems,
    }))
    return {
      propertyId,
      propertyName: propertyById.get(propertyId)?.name ?? 'Unknown property',
      headerGroups,
    }
  })
}

export function Kpi() {
  const { profile, isAdmin, isProjectManager } = useAuth()
  const { profiles: managerProfiles } = useManagerProfiles()

  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')

  const [assignments, setAssignments] = useState<ScopeItemAssignment[]>([])
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile && !selectedProfileId) setSelectedProfileId(profile.id)
  }, [profile, selectedProfileId])

  useEffect(() => {
    if (!selectedProfileId) return
    let mounted = true
    setLoading(true)
    setError(null)

    async function load() {
      const { data: assignmentRows, error: assignError } = await supabase
        .from('scope_item_assignments')
        .select('id, scope_item_id, profile_id, assigned_by, assigned_at, unassigned_at')
        .eq('profile_id', selectedProfileId)
        .is('unassigned_at', null)
      if (!mounted) return
      if (assignError) {
        setError(assignError.message)
        setLoading(false)
        return
      }

      const activeAssignments = assignmentRows ?? []
      const scopeItemIds = [...new Set(activeAssignments.map((a) => a.scope_item_id))]
      if (scopeItemIds.length === 0) {
        setAssignments([])
        setScopeItems([])
        setProperties([])
        setLoading(false)
        return
      }

      const { data: assignedItems, error: itemsError } = await supabase
        .from('scope_items')
        .select('*')
        .in('id', scopeItemIds)
      if (!mounted) return
      if (itemsError) {
        setError(itemsError.message)
        setLoading(false)
        return
      }

      const propertyIds = [...new Set((assignedItems ?? []).map((i) => i.property_id))]

      const [treeRes, propertiesRes] = await Promise.all([
        supabase.from('scope_items').select('*').in('property_id', propertyIds),
        supabase.from('properties').select('*').in('id', propertyIds),
      ])
      if (!mounted) return
      if (treeRes.error) {
        setError(treeRes.error.message)
        setLoading(false)
        return
      }
      if (propertiesRes.error) {
        setError(propertiesRes.error.message)
        setLoading(false)
        return
      }

      setAssignments(activeAssignments)
      setScopeItems(treeRes.data ?? [])
      setProperties(propertiesRes.data ?? [])
      setLoading(false)
    }
    load()

    return () => {
      mounted = false
    }
  }, [selectedProfileId])

  const itemsById = useMemo(() => buildItemIndex(scopeItems), [scopeItems])
  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])

  const assignedItems = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.scope_item_id))
    const all = scopeItems.filter((i) => assignedIds.has(i.id))
    return propertyFilter === 'all' ? all : all.filter((i) => i.property_id === propertyFilter)
  }, [assignments, scopeItems, propertyFilter])

  const doneItems = assignedItems.filter((i) => i.checked_at)
  const pendingItems = assignedItems.filter((i) => !i.checked_at)

  const pendingGroups = useMemo(
    () => buildPendingGroups(pendingItems, itemsById, propertyById),
    [pendingItems, itemsById, propertyById]
  )

  async function handleToggleItem(item: ScopeItem) {
    if (!profile) return
    const property = propertyById.get(item.property_id)
    if (!property) return
    const checking = !item.checked_at
    const optimisticPatch = checking
      ? { checked_by: profile.id, checked_at: new Date().toISOString() }
      : { checked_by: null, checked_at: null }
    const prevScopeItems = scopeItems
    setScopeItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...optimisticPatch } : i)))
    try {
      await toggleScopeItemChecked({
        item,
        actorId: profile.id,
        propertyId: property.id,
        propertyName: property.name,
      })
    } catch (err) {
      setScopeItems(prevScopeItems)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (!isProjectManager) return <Navigate to="/" replace />

  const pieData = [
    { name: 'Done', value: doneItems.length },
    { name: 'Pending', value: pendingItems.length },
  ]
  const hasData = doneItems.length + pendingItems.length > 0

  return (
    <div>
      <h1 className="mb-5 text-3xl font-bold text-gray-900">KPI</h1>

      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
        {isAdmin && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Person
            <select
              value={selectedProfileId}
              onChange={(e) => {
                setSelectedProfileId(e.target.value)
                setPropertyFilter('all')
              }}
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            >
              {managerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                  {p.id === profile?.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Property
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
          >
            <option value="all">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            {!hasData ? (
              <p className="py-6 text-center text-sm text-gray-500">No assigned scope points.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    <Cell fill={DONE_COLOR} />
                    <Cell fill={PENDING_COLOR} />
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Work still pending</h2>

            {pendingItems.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing pending — all caught up.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {pendingGroups.map((group) => (
                  <div key={group.propertyId}>
                    {propertyFilter === 'all' && (
                      <h3 className="mb-2 text-sm font-semibold text-gray-700">{group.propertyName}</h3>
                    )}
                    <div className="flex flex-col gap-2">
                      {group.headerGroups.map((header) => (
                        <details
                          key={header.taskId}
                          className="group rounded-lg border border-gray-100 bg-white p-3"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className="text-gray-400 transition-transform group-open:rotate-90"
                                size={14}
                              />
                              <span className="text-sm font-semibold text-gray-900">{header.taskTitle}</span>
                            </div>
                            <span className="text-[11px] font-medium text-gray-500">
                              {header.items.length} pending
                            </span>
                          </summary>
                          <div className="mt-2 flex flex-col gap-0.5 pl-6">
                            {header.items.map((item) => (
                              <label
                                key={item.id}
                                className="flex cursor-pointer items-center gap-3 rounded-lg p-1.5 hover:bg-gray-50"
                              >
                                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-white">
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={false}
                                    onChange={() => handleToggleItem(item)}
                                  />
                                </span>
                                <span className="text-sm font-medium text-gray-900">{item.title}</span>
                              </label>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
