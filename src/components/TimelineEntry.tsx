import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import type { Entry } from '../types'
import { Carousel } from './Carousel'

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
  const photoUrls = entry.photo_paths.map(
    (path) => supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
  )

  return (
    <article className="card timeline-entry">
      <div className="timeline-body">
        <p className="timeline-note">{entry.note}</p>
        <p className="timeline-meta">
          Uploaded by <strong>{entry.uploader_name}</strong> · {formatTimestamp(entry.created_at)}
        </p>
      </div>
      <div className="timeline-photos">
        <Carousel photos={photoUrls} />
      </div>
    </article>
  )
}
