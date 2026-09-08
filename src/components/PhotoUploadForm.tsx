import { useRef, useState, type FormEvent } from 'react'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export function PhotoUploadForm({ propertyId }: { propertyId: string }) {
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setPreview(selected ? URL.createObjectURL(selected) : null)
  }

  function resetForm() {
    setFile(null)
    setPreview(null)
    setNote('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !file) return
    setError(null)
    setUploading(true)

    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('entries').insert({
        property_id: propertyId,
        photo_path: path,
        note: note.trim(),
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

      <label className="file-drop">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          required
          onChange={handleFileChange}
        />
        {preview ? (
          <img src={preview} alt="Selected preview" className="file-preview" />
        ) : (
          <span>Tap to take or choose a photo</span>
        )}
      </label>

      <label>
        Note — what's done, what's pending
        <textarea
          required
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Cabinets installed and painted. Countertop measurement scheduled for next week."
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-primary" type="submit" disabled={uploading || !file}>
        {uploading ? 'Uploading…' : 'Post update'}
      </button>
    </form>
  )
}
