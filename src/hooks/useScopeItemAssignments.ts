import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { ScopeItemAssignment } from '../types'

// All scope_item_assignments (active and ended) for every scope_item
// under a property — fetched via an embedded filter through scope_items
// since the assignments table has no property_id column of its own.
export function useScopeItemAssignments(propertyId: string | undefined) {
  const [assignments, setAssignments] = useState<ScopeItemAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let mounted = true
    setLoading(true)

    supabase
      .from('scope_item_assignments')
      .select('id, scope_item_id, profile_id, assigned_by, assigned_at, unassigned_at, scope_items!inner(property_id)')
      .eq('scope_items.property_id', propertyId)
      .then(({ data, error: fetchError }) => {
        if (!mounted) return
        if (fetchError) setError(fetchError.message)
        setAssignments(
          (data ?? []).map(({ scope_items: _scopeItems, ...row }) => row as ScopeItemAssignment)
        )
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [propertyId])

  return { assignments, setAssignments, loading, error }
}
