import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { ScopeItem } from '../types'

// Loads the full scope_items tree (all 3 levels) for a property in one
// shot, live-synced over realtime. Every page that needs any part of the
// tree — property overview, a Task, or a Subtask — fetches the whole
// thing and filters locally, since percentages have to be computed from
// the full tree anyway.
export function useScopeItems(propertyId: string | undefined) {
  const [items, setItems] = useState<ScopeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) return
    let mounted = true
    setLoading(true)

    supabase
      .from('scope_items')
      .select('*')
      .eq('property_id', propertyId)
      .order('level')
      .order('position')
      .then(({ data, error: fetchError }) => {
        if (!mounted) return
        if (fetchError) setError(fetchError.message)
        setItems(data ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`scope-items-${propertyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scope_items', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const row = payload.new as ScopeItem
          setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scope_items', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const row = payload.new as ScopeItem
          setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'scope_items', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const oldId = (payload.old as ScopeItem).id
          setItems((prev) => prev.filter((i) => i.id !== oldId))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [propertyId])

  return { items, setItems, loading, error, setError }
}
