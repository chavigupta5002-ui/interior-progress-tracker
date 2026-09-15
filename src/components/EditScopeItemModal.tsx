import { useState, type FormEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import type { ScopeItem } from '../types'

// Admin-only edit view opened from a scope item's kebab menu: rename the
// title, or delete it (and its descendants) with the same
// confirm-before-delete behavior the standalone delete button used to
// have.
export function EditScopeItemModal({
  item,
  descendantCount,
  onClose,
  onSave,
  onDelete,
}: {
  item: ScopeItem
  descendantCount: number
  onClose: () => void
  onSave: (newTitle: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(item.title)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  async function handleDelete() {
    const message =
      descendantCount === 0
        ? `Delete "${item.title}"? This cannot be undone.`
        : `Delete "${item.title}" and its ${descendantCount} subtask${descendantCount === 1 ? '' : 's'}? This cannot be undone.`
    if (!window.confirm(message)) return
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${item.title}`}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Edit</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSave}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Title
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || deleting || !title.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>

        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleDelete}
          disabled={saving || deleting}
        >
          <Trash2 size={16} />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
