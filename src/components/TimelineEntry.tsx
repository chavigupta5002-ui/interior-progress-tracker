import { useState } from 'react'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry } from '../types'
import { Carousel } from './Carousel'
import { Check, Pencil, Trash2 } from 'lucide-react'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart}, ${timePart}`
}

interface TimelineEntryProps {
  entry: Entry
  onUpdated?: (entry: Entry) => void
  onDeleted?: (entryId: string) => void
}

export function TimelineEntry({ entry, onUpdated, onDeleted }: TimelineEntryProps) {
  const { profile, isAdmin } = useAuth()
  const canManage = isAdmin || entry.created_by === profile?.id

  const [editing, setEditing] = useState(false)
  const [noteDraft, setNoteDraft] = useState(entry.note)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [togglingReport, setTogglingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const photoUrls = (entry.photo_paths ?? []).map(
    (path) => supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
  )

  async function handleSave() {
    const trimmed = noteDraft.trim()
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('entries')
      .update({ note: trimmed })
      .eq('id', entry.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onUpdated?.({ ...entry, note: trimmed })
    setEditing(false)
  }

  function handleCancel() {
    setNoteDraft(entry.note)
    setError(null)
    setEditing(false)
  }

  async function handleDelete() {
    const ok = window.confirm('Delete this entry? This cannot be undone.')
    if (!ok) return
    setDeleting(true)
    setError(null)

    const { data: deletedRows, error: deleteError } = await supabase
      .from('entries')
      .delete()
      .eq('id', entry.id)
      .select('id')
    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Nothing was deleted — you may not have permission to delete this entry.')
      setDeleting(false)
      return
    }

    if (entry.photo_paths && entry.photo_paths.length > 0) {
      await supabase.storage.from(PHOTOS_BUCKET).remove(entry.photo_paths)
    }
    onDeleted?.(entry.id)
  }

  async function handleToggleShowInReport(next: boolean) {
    setTogglingReport(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('entries')
      .update({ show_in_report: next })
      .eq('id', entry.id)
    setTogglingReport(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onUpdated?.({ ...entry, show_in_report: next })
  }

  return (
    <article className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      {editing ? (
        <div className="mb-3 flex flex-col gap-2">
          <textarea
            rows={3}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            disabled={saving}
            className="resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#FFD700] px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {entry.note && <p className="mb-2 text-sm whitespace-pre-wrap text-gray-800">{entry.note}</p>}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        </>
      )}

      <p className="text-xs text-gray-400">
        Uploaded by <span className="font-medium text-gray-500">{entry.uploader_name}</span> ·{' '}
        {formatTimestamp(entry.created_at)}
      </p>

      {isAdmin ? (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-500">
          <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white">
            <input
              type="checkbox"
              className="sr-only"
              checked={entry.show_in_report}
              disabled={togglingReport}
              onChange={(e) => handleToggleShowInReport(e.target.checked)}
            />
            {entry.show_in_report && (
              <span className="absolute inset-0 flex items-center justify-center rounded bg-emerald-600">
                <Check className="text-white" size={10} strokeWidth={3} />
              </span>
            )}
          </span>
          Show in report
        </label>
      ) : (
        entry.show_in_report && (
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            In report
          </span>
        )
      )}

      {photoUrls.length > 0 && (
        <div className="mt-3">
          <Carousel photos={photoUrls} />
        </div>
      )}

      {canManage && !editing && (
        <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </article>
  )
}
