import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'

// Admin/PM profiles — the pool of people a scope item can be assigned
// to, and the pool an admin picks from on the KPI page.
export function useManagerProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'project_manager'])
      .order('display_name')
      .then(({ data }) => {
        if (!mounted) return
        setProfiles(data ?? [])
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return { profiles, loading }
}
