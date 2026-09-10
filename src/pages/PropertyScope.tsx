import { Link, useParams } from 'react-router-dom'
import { useProperty } from '../hooks/useProperty'
import { ScopeChecklist } from '../components/ScopeChecklist'
import { ChevronLeft } from 'lucide-react'

export function PropertyScope() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { property, loading } = useProperty(propertyId)

  if (!propertyId) return null

  return (
    <div>
      <Link
        to={`/properties/${propertyId}`}
        className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="mr-1" size={16} />
        Back to property
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !property ? (
        <p className="text-sm text-gray-500">Property not found.</p>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold text-gray-900">{property.name}</h1>
          <ScopeChecklist propertyId={property.id} propertyName={property.name} />
        </>
      )}
    </div>
  )
}
