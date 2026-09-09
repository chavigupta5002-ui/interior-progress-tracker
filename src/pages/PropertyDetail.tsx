import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useProperty } from '../hooks/useProperty'
import { BackArrowIcon, CameraIcon, ChecklistIcon, ReportIcon, TrashIcon } from '../components/Icon'

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

  return (
    <div className="page">
      <Link to="/" className="back-link icon-link">
        <BackArrowIcon width={16} height={16} />
        All properties
      </Link>

      {loading ? (
        <p>Loading…</p>
      ) : !property ? (
        <p>Property not found.</p>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1>{property.name}</h1>
              {property.description && <p className="property-description">{property.description}</p>}
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-danger"
                onClick={handleDeleteProperty}
                disabled={deletingProperty}
              >
                <TrashIcon width={16} height={16} />
                {deletingProperty ? 'Deleting…' : 'Delete property'}
              </button>
            )}
          </div>

          {deleteError && <p className="form-error">{deleteError}</p>}

          {isProjectManager ? (
            <div className="property-nav-grid">
              <Link to={`/properties/${property.id}/scope`} className="card property-nav-card">
                <ChecklistIcon width={28} height={28} />
                <span>Scope of Work</span>
              </Link>
              <Link to={`/properties/${property.id}/updates`} className="card property-nav-card">
                <CameraIcon width={28} height={28} />
                <span>Add Updates</span>
              </Link>
            </div>
          ) : (
            <Link to={`/properties/${property.id}/scope`} className="card property-nav-card">
              <ChecklistIcon width={28} height={28} />
              <span>Scope of Work</span>
            </Link>
          )}

          <Link to={`/reports?propertyId=${property.id}`} className="card property-nav-card">
            <ReportIcon width={28} height={28} />
            <span>View Report</span>
          </Link>
        </>
      )}
    </div>
  )
}
