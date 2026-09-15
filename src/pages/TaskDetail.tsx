import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import { useScopeItems } from '../hooks/useScopeItems'
import { useScopeItemAssignments } from '../hooks/useScopeItemAssignments'
import { useManagerProfiles } from '../hooks/useManagerProfiles'
import { computeItemPercent, getAllDescendants, getDirectChildren } from '../lib/scopeProgress'
import { deleteScopeItemWithDescendants, toggleScopeItemChecked } from '../lib/scopeActions'
import { BatteryProgressBar } from '../components/BatteryProgressBar'
import { ProgressRing } from '../components/ProgressRing'
import { DeadlineStats } from '../components/DeadlineStats'
import { FloatingActionButton } from '../components/FloatingActionButton'
import { AddScopeItemModal } from '../components/AddScopeItemModal'
import { ScopeItemAssigneeControl } from '../components/ScopeItemAssigneeControl'
import { Check, ChevronLeft, ChevronRight, MoreVertical, Plus, Trash2 } from 'lucide-react'
import type { ScopeItem } from '../types'

export function TaskDetail() {
  const { propertyId, taskId } = useParams<{ propertyId: string; taskId: string }>()
  const navigate = useNavigate()
  const { profile, isAdmin, isProjectManager } = useAuth()
  const canManage = isProjectManager // true for admins too, see AuthContext
  const { property } = useProperty(propertyId)
  const { items, setItems, loading, error, setError } = useScopeItems(propertyId)
  const { assignments, setAssignments } = useScopeItemAssignments(canManage ? propertyId : undefined)
  const { profiles: managerProfiles } = useManagerProfiles()
  const nameById = new Map(managerProfiles.map((p) => [p.id, p.display_name]))

  const [savingDeadline, setSavingDeadline] = useState(false)
  const [showAddSubtask, setShowAddSubtask] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null)

  const task = items.find((i) => i.id === taskId && i.level === 1)
  const taskPercent = task ? computeItemPercent(task, items) : 0
  const subtasks = task ? getDirectChildren(items, task.id) : []

  async function handleChangeDeadline(value: string | null) {
    if (!task) return
    setSavingDeadline(true)
    const prevItems = items
    setItems((prev) => prev.map((i) => (i.id === task.id ? { ...i, deadline: value } : i)))
    const { error: updateError } = await supabase.from('scope_items').update({ deadline: value }).eq('id', task.id)
    if (updateError) {
      setItems(prevItems)
      setError(updateError.message)
    }
    setSavingDeadline(false)
  }

  async function handleToggleSubtask(subtask: ScopeItem) {
    if (!profile || !property) return
    const prevItems = items
    const checking = !subtask.checked_at
    const optimisticPatch = checking
      ? { checked_by: profile.id, checked_at: new Date().toISOString() }
      : { checked_by: null, checked_at: null }
    setItems((prev) => prev.map((i) => (i.id === subtask.id ? { ...i, ...optimisticPatch } : i)))
    try {
      await toggleScopeItemChecked({
        item: subtask,
        actorId: profile.id,
        propertyId: property.id,
        propertyName: property.name,
      })
    } catch (err) {
      setItems(prevItems)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleAddSubtaskOption(subtask: ScopeItem) {
    setOpenMenuId(null)
    if (subtask.checked_at && profile && property) {
      const prevItems = items
      setItems((prev) =>
        prev.map((i) => (i.id === subtask.id ? { ...i, checked_by: null, checked_at: null } : i))
      )
      try {
        await toggleScopeItemChecked({
          item: subtask,
          actorId: profile.id,
          propertyId: property.id,
          propertyName: property.name,
        })
      } catch (err) {
        setItems(prevItems)
        setError(err instanceof Error ? err.message : 'Something went wrong')
        return
      }
    }
    navigate(`/properties/${propertyId}/tasks/${taskId}/subtasks/${subtask.id}`)
  }

  async function handleAddSubtask(title: string) {
    if (!profile || !task) return
    const { error: insertError } = await supabase.from('scope_items').insert({
      property_id: propertyId,
      parent_id: task.id,
      level: 2,
      title,
      position: subtasks.length,
      created_by: profile.id,
    })
    if (insertError) throw insertError
  }

  async function handleDeleteSubtask(subtask: ScopeItem) {
    if (!profile || !property) return
    const descendants = getAllDescendants(subtask, items)
    const message =
      descendants.length === 0
        ? `Delete "${subtask.title}"? This cannot be undone.`
        : `Delete "${subtask.title}" and its ${descendants.length} subtask${descendants.length === 1 ? '' : 's'}? This cannot be undone.`
    if (!window.confirm(message)) return

    setDeletingSubtaskId(subtask.id)
    setError(null)
    try {
      await deleteScopeItemWithDescendants({
        item: subtask,
        items,
        actorId: profile.id,
        propertyId: property.id,
      })
      const removedIds = new Set([subtask.id, ...descendants.map((d) => d.id)])
      setItems((prev) => prev.filter((i) => !removedIds.has(i.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeletingSubtaskId(null)
    }
  }

  if (!propertyId || !taskId) return null

  return (
    <div>
      <Link
        to={`/properties/${propertyId}`}
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        Back to property
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !task ? (
        <p className="text-sm text-gray-500">Task not found.</p>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-4">
            <ProgressRing percent={taskPercent} />
            <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">{task.title}</h1>
          </div>

          <section className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <DeadlineStats
              deadline={task.deadline}
              percent={taskPercent}
              editable={canManage}
              saving={savingDeadline}
              onChangeDeadline={handleChangeDeadline}
            />
          </section>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Subtasks</h2>

            {subtasks.length === 0 ? (
              <p className="text-sm text-gray-500">
                {canManage ? 'No subtasks yet — use the + button to add one.' : 'No subtasks yet.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {subtasks.map((subtask) => {
                  const children = getDirectChildren(items, subtask.id)
                  const hasChildren = children.length > 0
                  const subtaskPercent = hasChildren
                    ? computeItemPercent(subtask, items)
                    : subtask.checked_at
                      ? 100
                      : 0

                  return (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-1 rounded-lg border border-gray-100 bg-white p-3"
                    >
                      {hasChildren ? (
                        <Link
                          to={`/properties/${propertyId}/tasks/${taskId}/subtasks/${subtask.id}`}
                          className="min-w-0 flex-1"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">{subtask.title}</span>
                            <ChevronRight size={14} className="flex-shrink-0 text-gray-300" />
                          </div>
                          <BatteryProgressBar percent={subtaskPercent} />
                        </Link>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <label className="flex cursor-pointer items-center gap-3 p-1">
                            <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-white">
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={!!subtask.checked_at}
                                disabled={!canManage}
                                onChange={() => handleToggleSubtask(subtask)}
                              />
                              {subtask.checked_at && (
                                <span className="absolute inset-0 flex items-center justify-center rounded bg-emerald-600">
                                  <Check className="text-white" size={12} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            <span
                              className={`truncate text-sm font-medium text-gray-900 ${subtask.checked_at ? 'line-through opacity-70' : ''}`}
                            >
                              {subtask.title}
                            </span>
                          </label>

                          {canManage && profile && property && (
                            <ScopeItemAssigneeControl
                              item={subtask}
                              propertyId={property.id}
                              propertyName={property.name}
                              actorId={profile.id}
                              managerProfiles={managerProfiles}
                              nameById={nameById}
                              assignments={assignments}
                              setAssignments={setAssignments}
                            />
                          )}
                        </div>
                      )}

                      {canManage && (
                        <div className="relative flex-shrink-0">
                          <button
                            type="button"
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="More options"
                            onClick={() => setOpenMenuId((id) => (id === subtask.id ? null : subtask.id))}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === subtask.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-100 bg-white p-1 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => handleAddSubtaskOption(subtask)}
                                >
                                  <Plus size={14} />
                                  Add Subtask
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                          onClick={() => handleDeleteSubtask(subtask)}
                          disabled={deletingSubtaskId === subtask.id}
                          aria-label={`Delete ${subtask.title}`}
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

          {canManage && <FloatingActionButton label="Add subtask" onClick={() => setShowAddSubtask(true)} />}

          {showAddSubtask && (
            <AddScopeItemModal
              heading="New Subtask"
              titlePlaceholder="Subtask title"
              onClose={() => setShowAddSubtask(false)}
              onSubmit={handleAddSubtask}
            />
          )}
        </>
      )}
    </div>
  )
}
