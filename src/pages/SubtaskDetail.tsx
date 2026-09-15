import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import { useScopeItems } from '../hooks/useScopeItems'
import { useScopeItemAssignments } from '../hooks/useScopeItemAssignments'
import { useManagerProfiles } from '../hooks/useManagerProfiles'
import { computeItemPercent, getAllDescendants, getDirectChildren } from '../lib/scopeProgress'
import { deleteScopeItemWithDescendants, renameScopeItem, toggleScopeItemChecked } from '../lib/scopeActions'
import { ProgressRing } from '../components/ProgressRing'
import { FloatingActionButton } from '../components/FloatingActionButton'
import { AddScopeItemModal } from '../components/AddScopeItemModal'
import { EditScopeItemModal } from '../components/EditScopeItemModal'
import { ScopeItemAssigneeControl } from '../components/ScopeItemAssigneeControl'
import { Check, ChevronLeft, MoreVertical } from 'lucide-react'
import { useState } from 'react'
import type { ScopeItem } from '../types'

export function SubtaskDetail() {
  const { propertyId, taskId, subtaskId } = useParams<{
    propertyId: string
    taskId: string
    subtaskId: string
  }>()
  const { profile, isAdmin, isProjectManager } = useAuth()
  const canManage = isProjectManager // true for admins too, see AuthContext
  const { property } = useProperty(propertyId)
  const { items, setItems, loading, error, setError } = useScopeItems(propertyId)
  const { assignments, setAssignments } = useScopeItemAssignments(canManage ? propertyId : undefined)
  const { profiles: managerProfiles } = useManagerProfiles()
  const nameById = new Map(managerProfiles.map((p) => [p.id, p.display_name]))

  const [showAddSubSubtask, setShowAddSubSubtask] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingSubsubtask, setEditingSubsubtask] = useState<ScopeItem | null>(null)

  const subtask = items.find((i) => i.id === subtaskId && i.level === 2)
  const subtaskPercent = subtask ? computeItemPercent(subtask, items) : 0
  const subsubtasks = subtask ? getDirectChildren(items, subtask.id) : []

  async function handleToggle(subsubtask: ScopeItem) {
    if (!profile || !property) return
    const checking = !subsubtask.checked_at
    const optimisticPatch = checking
      ? { checked_by: profile.id, checked_at: new Date().toISOString() }
      : { checked_by: null, checked_at: null }
    const prevItems = items
    setItems((prev) => prev.map((i) => (i.id === subsubtask.id ? { ...i, ...optimisticPatch } : i)))
    try {
      await toggleScopeItemChecked({
        item: subsubtask,
        actorId: profile.id,
        propertyId: property.id,
        propertyName: property.name,
      })
    } catch (err) {
      setItems(prevItems)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleAddSubSubtask(title: string) {
    if (!profile || !subtask) return
    const { error: insertError } = await supabase.from('scope_items').insert({
      property_id: propertyId,
      parent_id: subtask.id,
      level: 3,
      title,
      position: subsubtasks.length,
      created_by: profile.id,
    })
    if (insertError) throw insertError
  }

  async function handleDeleteSubsubtask(subsubtask: ScopeItem) {
    if (!profile || !property) return
    await deleteScopeItemWithDescendants({
      item: subsubtask,
      items,
      actorId: profile.id,
      propertyId: property.id,
    })
    setItems((prev) => prev.filter((i) => i.id !== subsubtask.id))
  }

  async function handleRenameSubsubtask(subsubtask: ScopeItem, newTitle: string) {
    if (!profile || !property) return
    const prevItems = items
    setItems((prev) => prev.map((i) => (i.id === subsubtask.id ? { ...i, title: newTitle } : i)))
    try {
      await renameScopeItem({ item: subsubtask, items, newTitle, actorId: profile.id, propertyId: property.id })
    } catch (err) {
      setItems(prevItems)
      throw err
    }
  }

  if (!propertyId || !taskId || !subtaskId) return null

  return (
    <div>
      <Link
        to={`/properties/${propertyId}/tasks/${taskId}`}
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        Back to task
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !subtask ? (
        <p className="text-sm text-gray-500">Subtask not found.</p>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-4">
            <ProgressRing percent={subtaskPercent} />
            <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">{subtask.title}</h1>
          </div>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Sub-subtasks</h2>

            {subsubtasks.length === 0 ? (
              <p className="text-sm text-gray-500">
                {canManage ? 'No sub-subtasks yet — use the + button to add one.' : 'No sub-subtasks yet.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {subsubtasks.map((subsubtask) => (
                  <div key={subsubtask.id} className="rounded-lg border border-gray-100 bg-white p-3">
                    <div className="flex items-center gap-1">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-white">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={!!subsubtask.checked_at}
                            disabled={!canManage}
                            onChange={() => handleToggle(subsubtask)}
                          />
                          {subsubtask.checked_at && (
                            <span className="absolute inset-0 flex items-center justify-center rounded bg-emerald-600">
                              <Check className="text-white" size={12} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span
                          className={`truncate text-sm font-medium text-gray-900 ${subsubtask.checked_at ? 'line-through opacity-70' : ''}`}
                        >
                          {subsubtask.title}
                        </span>
                      </label>

                      {isAdmin && (
                        <div className="relative flex-shrink-0">
                          <button
                            type="button"
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="More options"
                            onClick={() => setOpenMenuId((id) => (id === subsubtask.id ? null : subsubtask.id))}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === subsubtask.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-gray-100 bg-white p-1 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setEditingSubsubtask(subsubtask)
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {canManage && profile && property && (
                      <ScopeItemAssigneeControl
                        item={subsubtask}
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
                ))}
              </div>
            )}
          </section>

          {canManage && (
            <FloatingActionButton label="Add sub-subtask" onClick={() => setShowAddSubSubtask(true)} />
          )}

          {showAddSubSubtask && (
            <AddScopeItemModal
              heading="New Sub-subtask"
              titlePlaceholder="Sub-subtask title"
              onClose={() => setShowAddSubSubtask(false)}
              onSubmit={handleAddSubSubtask}
            />
          )}

          {editingSubsubtask && (
            <EditScopeItemModal
              item={editingSubsubtask}
              descendantCount={getAllDescendants(editingSubsubtask, items).length}
              onClose={() => setEditingSubsubtask(null)}
              onSave={(newTitle) => handleRenameSubsubtask(editingSubsubtask, newTitle)}
              onDelete={() => handleDeleteSubsubtask(editingSubsubtask)}
            />
          )}
        </>
      )}
    </div>
  )
}
