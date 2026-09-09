import { useState } from 'react'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry } from '../types'
import { Carousel } from './Carousel'
import { EditIcon, TrashIcon } from './Icon'

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
    <article className="card timeline-entry">
      <div className="timeline-body">
        {editing ? (
          <div className="timeline-edit">
            <textarea
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              disabled={saving}
            />
            {error && <p className="form-error">{error}</p>}
            <div className="timeline-edit-actions">
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {entry.note && <p className="timeline-note">{entry.note}</p>}
            {error && <p className="form-error">{error}</p>}
          </>
        )}
        <p className="timeline-meta">
          Uploaded by <strong>{entry.uploader_name}</strong> · {formatTimestamp(entry.created_at)}
        </p>
        {isAdmin ? (
          <label className="checkbox-label report-toggle">
            <input
              type="checkbox"
              checked={entry.show_in_report}
              disabled={togglingReport}
              onChange={(e) => handleToggleShowInReport(e.target.checked)}
            />
            Show in report
          </label>
        ) : (
          entry.show_in_report && <span className="report-badge">In report</span>
        )}
      </div>

      <div className="timeline-photos">
        <Carousel photos={photoUrls} />
      </div>

      {canManage && !editing && (
        <div className="timeline-actions">
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditing(true)}>
            <EditIcon width={14} height={14} />
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            <TrashIcon width={14} height={14} />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </article>
  )
}
