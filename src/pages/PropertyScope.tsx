import { Link, useParams } from 'react-router-dom'
import { useProperty } from '../hooks/useProperty'
import { ScopeChecklist } from '../components/ScopeChecklist'
import { BackArrowIcon } from '../components/Icon'

export function PropertyScope() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { property, loading } = useProperty(propertyId)

  if (!propertyId) return null

  return (
    <div className="page">
      <Link to={`/properties/${propertyId}`} className="back-link icon-link">
        <BackArrowIcon width={16} height={16} />
        Back to property
      </Link>

      {loading ? (
        <p>Loading…</p>
      ) : !property ? (
        <p>Property not found.</p>
      ) : (
        <>
          <h1>{property.name}</h1>
          <ScopeChecklist propertyId={property.id} propertyName={property.name} />
        </>
      )}
    </div>
  )
}
