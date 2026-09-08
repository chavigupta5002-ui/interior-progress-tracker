import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Property } from '../types'

export function useProperty(propertyId: string | undefined) {
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!propertyId) return
    let mounted = true
    setLoading(true)

    supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single()
      .then(({ data }) => {
        if (!mounted) return
        setProperty(data ?? null)
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [propertyId])

  return { property, loading }
}
