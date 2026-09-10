import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import { Camera, ChevronLeft, ClipboardList, FileText, Trash2 } from 'lucide-react'

export function PropertyDetail() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const { isAdmin, isProjectManager } = useAuth()
  const { property, loading } = useProperty(propertyId)
  const [deletingProperty, setDeletingProperty] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteProperty() {
    if (!property) return
    const ok = window.confirm(`Delete "${property.name}" and all of its entries? This cannot be undone.`)
    if (!ok) return
    setDeletingProperty(true)
    setDeleteError(null)

    const { data: entryRows } = await supabase
      .from('entries')
      .select('photo_paths')
      .eq('property_id', property.id)

    const { data: deletedRows, error } = await supabase
      .from('properties')
      .delete()
      .eq('id', property.id)
      .select('id')
    if (error) {
      setDeleteError(error.message)
      setDeletingProperty(false)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setDeleteError(
        'Nothing was deleted — you may not have permission to delete this property.'
      )
      setDeletingProperty(false)
      return
    }

    const allPhotoPaths = (entryRows ?? []).flatMap((e) => e.photo_paths ?? [])
    if (allPhotoPaths.length > 0) {
      await supabase.storage.from(PHOTOS_BUCKET).remove(allPhotoPaths)
    }

    navigate('/')
  }

  if (!propertyId) return null

  const navCardClass =
    'flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white p-5 text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-yellow-200'

  return (
    <div>
      <Link
        to="/"
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        All properties
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !property ? (
        <p className="text-sm text-gray-500">Property not found.</p>
      ) : (
        <>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{property.name}</h1>
              {property.description && (
                <p className="mt-1 text-sm text-gray-600">{property.description}</p>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={handleDeleteProperty}
                disabled={deletingProperty}
              >
                <Trash2 size={16} />
                {deletingProperty ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>

          {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Scope of Work</h2>

            {isProjectManager ? (
              <div className="grid grid-cols-2 gap-3">
                <Link to={`/properties/${property.id}/scope`} className={navCardClass}>
                  <ClipboardList className="text-yellow-500" size={28} />
                  <span className="text-sm font-medium text-gray-800">Scope of Work</span>
                </Link>
                <Link to={`/properties/${property.id}/updates`} className={navCardClass}>
                  <Camera className="text-yellow-500" size={28} />
                  <span className="text-sm font-medium text-gray-800">Add Updates</span>
                </Link>
              </div>
            ) : (
              <Link to={`/properties/${property.id}/scope`} className={navCardClass}>
                <ClipboardList className="text-yellow-500" size={28} />
                <span className="text-sm font-medium text-gray-800">Scope of Work</span>
              </Link>
            )}
          </section>

          <div className="mt-3">
            <Link to={`/reports?propertyId=${property.id}`} className={navCardClass}>
              <FileText className="text-yellow-500" size={28} />
              <span className="text-sm font-medium text-gray-800">View Report</span>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
