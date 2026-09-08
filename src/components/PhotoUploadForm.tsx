import { useRef, useState, type FormEvent } from 'react'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { CameraIcon, CloseIcon } from './Icon'

interface PendingPhoto {
  file: File
  preview: string
}

export function PhotoUploadForm({ propertyId }: { propertyId: string }) {
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [note, setNote] = useState('')
  const [showInReport, setShowInReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const canSubmit = photos.length > 0 || note.trim().length > 0

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) return
    setPhotos((prev) => [...prev, ...selected.map((file) => ({ file, preview: URL.createObjectURL(file) }))])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function resetForm() {
    setPhotos([])
    setNote('')
    setShowInReport(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !canSubmit) return
    setError(null)
    setUploading(true)

    try {
      const photoPaths: string[] = []
      for (const { file } of photos) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        photoPaths.push(path)
      }

      const { error: insertError } = await supabase.from('entries').insert({
        property_id: propertyId,
        photo_paths: photoPaths,
        note: note.trim(),
        show_in_report: showInReport,
        created_by: profile.id,
        uploader_name: profile.display_name,
      })
      if (insertError) throw insertError

      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="card upload-form" onSubmit={handleSubmit}>
      <h2>Add progress update</h2>

      {photos.length > 0 && (
        <div className="upload-preview-grid">
          {photos.map((p, i) => (
            <div key={p.preview} className="upload-preview-item">
              <img src={p.preview} alt="Selected preview" />
              <button
                type="button"
                className="upload-preview-remove"
                onClick={() => removePhoto(i)}
                aria-label="Remove photo"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="file-drop">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFileChange}
        />
        <span className="file-drop-hint">
          <CameraIcon />
          {photos.length > 0 ? 'Add another photo' : 'Tap to take or choose photos'}
        </span>
      </label>

      <label>
        Notes
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Cabinets installed and painted. Countertop measurement scheduled for next week."
        />
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={showInReport} onChange={(e) => setShowInReport(e.target.checked)} />
        Show this note in report
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-primary" type="submit" disabled={uploading || !canSubmit}>
        {uploading ? 'Uploading…' : 'Post update'}
      </button>
    </form>
  )
}
