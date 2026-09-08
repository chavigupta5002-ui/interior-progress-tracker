import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import type { Entry } from '../types'

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

export function TimelineEntry({ entry }: { entry: Entry }) {
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(entry.photo_path)

  return (
    <article className="card timeline-entry">
      <img src={data.publicUrl} alt="Progress update" className="timeline-photo" loading="lazy" />
      <div className="timeline-body">
        <p className="timeline-note">{entry.note}</p>
        <p className="timeline-meta">
          Uploaded by <strong>{entry.uploader_name}</strong> · {formatTimestamp(entry.created_at)}
        </p>
      </div>
    </article>
  )
}
