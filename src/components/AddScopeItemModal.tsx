import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'

// Reusable "add" form opened by the FloatingActionButton for creating a
// new Task, Subtask, or Sub-subtask (title, plus an optional deadline
// when the caller asks for it).
export function AddScopeItemModal({
  heading,
  titlePlaceholder = 'Title',
  showDeadline = false,
  onClose,
  onSubmit,
}: {
  heading: string
  titlePlaceholder?: string
  showDeadline?: boolean
  onClose: () => void
  onSubmit: (title: string, deadline: string | null) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed, deadline || null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            {titlePlaceholder}
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titlePlaceholder}
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
            />
          </label>

          {showDeadline && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Deadline (optional)
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={submitting || !title.trim()}
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>
    </div>
  )
}
