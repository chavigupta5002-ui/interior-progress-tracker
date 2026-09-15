import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useScopeItems } from '../hooks/useScopeItems'
import { computeItemPercent, getDirectChildren } from '../lib/scopeProgress'
import { ProgressRing } from '../components/ProgressRing'
import { FloatingActionButton } from '../components/FloatingActionButton'
import { AddScopeItemModal } from '../components/AddScopeItemModal'
import { Check, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import type { ScopeItem } from '../types'

export function SubtaskDetail() {
  const { propertyId, taskId, subtaskId } = useParams<{
    propertyId: string
    taskId: string
    subtaskId: string
  }>()
  const { profile, isProjectManager } = useAuth()
  const canManage = isProjectManager // true for admins too, see AuthContext
  const { items, setItems, loading, error, setError } = useScopeItems(propertyId)

  const [showAddSubSubtask, setShowAddSubSubtask] = useState(false)

  const subtask = items.find((i) => i.id === subtaskId && i.level === 2)
  const subtaskPercent = subtask ? computeItemPercent(subtask, items) : 0
  const subsubtasks = subtask ? getDirectChildren(items, subtask.id) : []

  async function handleToggle(subsubtask: ScopeItem) {
    if (!profile) return
    const checking = !subsubtask.checked_at
    const patch = checking
      ? { checked_by: profile.id, checked_at: new Date().toISOString() }
      : { checked_by: null, checked_at: null }
    const prevItems = items
    setItems((prev) => prev.map((i) => (i.id === subsubtask.id ? { ...i, ...patch } : i)))
    const { error: updateError } = await supabase.from('scope_items').update(patch).eq('id', subsubtask.id)
    if (updateError) {
      setItems(prevItems)
      setError(updateError.message)
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
                  <label
                    key={subsubtask.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 bg-white p-3"
                  >
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
        </>
      )}
    </div>
  )
}
