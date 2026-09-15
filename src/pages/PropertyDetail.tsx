import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import { useScopeItems } from '../hooks/useScopeItems'
import {
  computeItemPercent,
  computePropertyPercent,
  countCompleteDirectChildren,
  getAllDescendants,
} from '../lib/scopeProgress'
import { deleteScopeItemWithDescendants } from '../lib/scopeActions'
import { BatteryProgressBar } from '../components/BatteryProgressBar'
import { DeadlineStats } from '../components/DeadlineStats'
import { FloatingActionButton } from '../components/FloatingActionButton'
import { AddScopeItemModal } from '../components/AddScopeItemModal'
import { CongratsModal } from '../components/CongratsModal'
import { Camera, ChevronLeft, ChevronRight, FileText, Trash2 } from 'lucide-react'
import type { ScopeItem } from '../types'

export function PropertyDetail() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const { profile, isAdmin, isProjectManager } = useAuth()
  const { property, loading, setProperty } = useProperty(propertyId)
  const { items, setItems, loading: itemsLoading, error: itemsError, setError: setItemsError } =
    useScopeItems(propertyId)
  const canManage = isProjectManager // true for admins too, see AuthContext

  const [deletingProperty, setDeletingProperty] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [savingDeadline, setSavingDeadline] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showCongrats, setShowCongrats] = useState(false)
  const initializedRef = useRef(false)
  const prevCompleteRef = useRef(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleDeleteProperty() {
    if (!property) return
    const ok = window.confirm(`Delete "${property.name}" and all of its entries? This cannot be undone.`)
    if (!ok) return
    setDeletingProperty(true)
    setDeleteError(null)

    const { data: entryRows } = await supabase
      .from('entries')
      .select('photo_paths')
      .eq('property_id', property.id)

    const { data: deletedRows, error } = await supabase
      .from('properties')
      .delete()
      .eq('id', property.id)
      .select('id')
    if (error) {
      setDeleteError(error.message)
      setDeletingProperty(false)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setDeleteError(
        'Nothing was deleted — you may not have permission to delete this property.'
      )
      setDeletingProperty(false)
      return
    }

    const allPhotoPaths = (entryRows ?? []).flatMap((e) => e.photo_paths ?? [])
    if (allPhotoPaths.length > 0) {
      await supabase.storage.from(PHOTOS_BUCKET).remove(allPhotoPaths)
    }

    navigate('/')
  }

  async function handleChangeDeadline(value: string | null) {
    if (!property) return
    setSavingDeadline(true)
    const prev = property.deadline
    setProperty({ ...property, deadline: value })
    const { error } = await supabase.from('properties').update({ deadline: value }).eq('id', property.id)
    if (error) {
      setProperty({ ...property, deadline: prev })
      setDeleteError(error.message)
    }
    setSavingDeadline(false)
  }

  async function handleAddTask(title: string, deadline: string | null) {
    if (!property || !profile) return
    setAddError(null)
    const { error } = await supabase.from('scope_items').insert({
      property_id: property.id,
      parent_id: null,
      level: 1,
      title,
      position: tasks.length,
      deadline,
      created_by: profile.id,
    })
    if (error) {
      setAddError(error.message)
      throw error
    }
  }

  async function handleDeleteTask(task: ScopeItem) {
    if (!profile || !property) return
    const descendants = getAllDescendants(task, items)
    const message =
      descendants.length === 0
        ? `Delete "${task.title}"? This cannot be undone.`
        : `Delete "${task.title}" and its ${descendants.length} subtask${descendants.length === 1 ? '' : 's'}? This cannot be undone.`
    if (!window.confirm(message)) return

    setDeletingTaskId(task.id)
    setItemsError(null)
    try {
      await deleteScopeItemWithDescendants({
        item: task,
        items,
        actorId: profile.id,
        propertyId: property.id,
      })
      const removedIds = new Set([task.id, ...descendants.map((d) => d.id)])
      setItems((prev) => prev.filter((i) => !removedIds.has(i.id)))
    } catch (err) {
      setItemsError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeletingTaskId(null)
    }
  }

  const overallPercent = computePropertyPercent(items)
  const tasks = [...items.filter((i) => i.level === 1)].sort((a, b) => a.position - b.position)

  useEffect(() => {
    if (itemsLoading) return
    if (tasks.length === 0) {
      initializedRef.current = false
      return
    }
    const complete = overallPercent === 100
    if (!initializedRef.current) {
      initializedRef.current = true
      prevCompleteRef.current = complete
      return
    }
    if (complete && !prevCompleteRef.current) {
      setShowCongrats(true)
    }
    prevCompleteRef.current = complete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLoading, overallPercent, tasks.length])

  if (!propertyId) return null

  const navCardClass =
    'flex flex-col items-center justify-center gap-2 rounded-xl bg-[#FFD700] p-5 text-center shadow-sm transition-colors hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none'

  return (
    <div>
      <Link
        to="/"
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        All properties
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !property ? (
        <p className="text-sm text-gray-500">Property not found.</p>
      ) : (
        <>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{property.name}</h1>
              {property.description && (
                <p className="mt-1 text-sm text-gray-600">{property.description}</p>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={handleDeleteProperty}
                disabled={deletingProperty}
              >
                <Trash2 size={16} />
                {deletingProperty ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>

          {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

          <section className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <BatteryProgressBar percent={overallPercent} label="Overall progress" />
            <div className="mt-4 border-t border-gray-100 pt-4">
              <DeadlineStats
                deadline={property.deadline}
                percent={overallPercent}
                editable={canManage}
                saving={savingDeadline}
                onChangeDeadline={handleChangeDeadline}
              />
            </div>
          </section>

          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Tasks</h2>

            {itemsError && <p className="mb-3 text-sm text-red-600">{itemsError}</p>}

            {itemsLoading ? (
              <p className="text-sm text-gray-500">Loading tasks…</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-gray-500">
                {canManage ? 'No tasks yet — use the + button to add one.' : 'No scope of work defined yet.'}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {tasks.map((task) => {
                  const taskPercent = computeItemPercent(task, items)
                  const { complete, total } = countCompleteDirectChildren(task, items)
                  return (
                    <div key={task.id} className="flex items-center gap-1">
                      <Link
                        to={`/properties/${property.id}/tasks/${task.id}`}
                        className="block flex-1 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-gray-200"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="min-w-0 truncate text-base font-semibold text-gray-900">{task.title}</h3>
                          <div className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-gray-500">
                            {complete} of {total} subtasks
                            <ChevronRight size={14} className="text-gray-300" />
                          </div>
                        </div>
                        <BatteryProgressBar percent={taskPercent} />
                      </Link>
                      {isAdmin && (
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                          onClick={() => handleDeleteTask(task)}
                          disabled={deletingTaskId === task.id}
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {isProjectManager ? (
            <div className="grid grid-cols-2 gap-3">
              <Link to={`/properties/${property.id}/updates`} className={navCardClass}>
                <Camera className="text-black" size={28} />
                <span className="text-sm font-semibold text-black">Add Updates</span>
              </Link>
              <Link to={`/reports?propertyId=${property.id}`} className={navCardClass}>
                <FileText className="text-black" size={28} />
                <span className="text-sm font-semibold text-black">View Report</span>
              </Link>
            </div>
          ) : (
            <Link to={`/reports?propertyId=${property.id}`} className={navCardClass}>
              <FileText className="text-black" size={28} />
              <span className="text-sm font-semibold text-black">View Report</span>
            </Link>
          )}

          {canManage && (
            <FloatingActionButton label="Add task" onClick={() => setShowAddTask(true)} />
          )}

          {showAddTask && (
            <AddScopeItemModal
              heading="New Task"
              titlePlaceholder="Task title"
              showDeadline
              onClose={() => {
                setShowAddTask(false)
                setAddError(null)
              }}
              onSubmit={handleAddTask}
            />
          )}
          {addError && <p className="mt-3 text-sm text-red-600">{addError}</p>}

          {showCongrats && (
            <CongratsModal propertyName={property.name} onClose={() => setShowCongrats(false)} />
          )}
        </>
      )}
    </div>
  )
}
