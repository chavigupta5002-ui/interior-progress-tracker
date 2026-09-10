import { useRef, useState, type FormEvent } from 'react'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Camera, Check, X } from 'lucide-react'

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
    <form
      className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
      onSubmit={handleSubmit}
    >
      <h2 className="mb-3 text-base font-semibold text-gray-900">Add progress update</h2>

      {photos.length > 0 && (
        <div className="mb-3 grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              <img src={p.preview} alt="Selected preview" className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                onClick={() => removePhoto(i)}
                aria-label="Remove photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="mb-3 flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 hover:border-gray-300">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />
        <Camera size={18} />
        {photos.length > 0 ? 'Add another photo' : 'Tap to take or choose photos'}
      </label>

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        Notes
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Cabinets installed and painted. Countertop measurement scheduled for next week."
          className="resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
        />
      </label>

      <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700">
        <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white">
          <input
            type="checkbox"
            className="sr-only"
            checked={showInReport}
            onChange={(e) => setShowInReport(e.target.checked)}
          />
          {showInReport && (
            <span className="absolute inset-0 flex items-center justify-center rounded bg-emerald-600">
              <Check className="text-white" size={12} strokeWidth={3} />
            </span>
          )}
        </span>
        Show this note in report
      </label>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        className="w-full rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={uploading || !canSubmit}
      >
        {uploading ? 'Uploading…' : 'Post update'}
      </button>
    </form>
  )
}
