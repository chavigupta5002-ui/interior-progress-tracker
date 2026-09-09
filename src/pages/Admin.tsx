import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Profile, Property, Role } from '../types'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  viewer: 'Viewer',
}

export function Admin() {
  const { profile, isAdmin } = useAuth()

  const [users, setUsers] = useState<Profile[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState<string>('')
  const [accessProfileIds, setAccessProfileIds] = useState<Set<string>>(new Set())
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null)

  async function loadUsers() {
    setUsersLoading(true)
    setUsersError(null)
    const { data, error } = await supabase.from('profiles').select('*').order('display_name')
    if (error) setUsersError(error.message)
    setUsers(data ?? [])
    setUsersLoading(false)
  }

  async function loadProperties() {
    const { data } = await supabase.from('properties').select('*').order('name')
    setProperties(data ?? [])
    if (data && data.length > 0) setPropertyId((prev) => prev || data[0].id)
  }

  async function loadAccess(forPropertyId: string) {
    if (!forPropertyId) return
    setAccessLoading(true)
    setAccessError(null)
    const { data, error } = await supabase
      .from('property_access')
      .select('profile_id')
      .eq('property_id', forPropertyId)
    if (error) setAccessError(error.message)
    setAccessProfileIds(new Set((data ?? []).map((row) => row.profile_id)))
    setAccessLoading(false)
  }

  useEffect(() => {
    if (!isAdmin) return
    loadUsers()
    loadProperties()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !propertyId) return
    loadAccess(propertyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, propertyId])

  if (!isAdmin) return <Navigate to="/" replace />

  async function handleRoleChange(userId: string, nextRole: Role) {
    if (userId === profile?.id && nextRole !== 'admin') {
      const ok = window.confirm('This will remove your own admin access. Continue?')
      if (!ok) return
    }

    setSavingUserId(userId)
    setUsersError(null)
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId)
    if (error) {
      setUsersError(error.message)
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)))
    }
    setSavingUserId(null)
  }

  async function handleGrantAccess(profileId: string) {
    if (!propertyId || !profile) return
    setSavingAccessId(profileId)
    setAccessError(null)
    const { error } = await supabase.from('property_access').insert({
      property_id: propertyId,
      profile_id: profileId,
      granted_by: profile.id,
    })
    if (error) {
      setAccessError(error.message)
    } else {
      setAccessProfileIds((prev) => new Set(prev).add(profileId))
    }
    setSavingAccessId(null)
  }

  async function handleRevokeAccess(profileId: string) {
    if (!propertyId) return
    setSavingAccessId(profileId)
    setAccessError(null)
    const { data: deletedRows, error } = await supabase
      .from('property_access')
      .delete()
      .eq('property_id', propertyId)
      .eq('profile_id', profileId)
      .select('profile_id')
    if (error) {
      setAccessError(error.message)
    } else if (!deletedRows || deletedRows.length === 0) {
      setAccessError('Nothing was revoked — you may not have permission to change this.')
    } else {
      setAccessProfileIds((prev) => {
        const next = new Set(prev)
        next.delete(profileId)
        return next
      })
    }
    setSavingAccessId(null)
  }

  const selectedProperty = properties.find((p) => p.id === propertyId) ?? null

  return (
    <div className="page">
      <h1>Admin</h1>

      <section className="card">
        <h2>User roles</h2>
        <p className="property-description">
          Promote a viewer to project manager, or grant/remove admin access.
        </p>

        {usersError && <p className="form-error">{usersError}</p>}

        {usersLoading ? (
          <p>Loading users…</p>
        ) : users.length === 0 ? (
          <p className="empty-state">No users found.</p>
        ) : (
          <div className="admin-table">
            {users.map((u) => (
              <div key={u.id} className="admin-row">
                <span className="admin-row-name">
                  {u.display_name}
                  {u.id === profile?.id && <span className="admin-row-you"> (you)</span>}
                </span>
                <select
                  value={u.role}
                  disabled={savingUserId === u.id}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Property access</h2>
        <p className="property-description">
          Admins and project managers can already see every property. Grant viewers access to a
          specific property here.
        </p>

        {properties.length === 0 ? (
          <p className="empty-state">No properties yet.</p>
        ) : (
          <>
            <label>
              Property
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {accessError && <p className="form-error">{accessError}</p>}

            {accessLoading ? (
              <p>Loading access…</p>
            ) : (
              <div className="admin-table">
                {users
                  .filter((u) => u.role === 'viewer')
                  .map((u) => {
                    const hasAccess = accessProfileIds.has(u.id)
                    return (
                      <div key={u.id} className="admin-row">
                        <span className="admin-row-name">{u.display_name}</span>
                        <button
                          type="button"
                          className={`btn ${hasAccess ? 'btn-ghost' : 'btn-primary'}`}
                          disabled={savingAccessId === u.id}
                          onClick={() =>
                            hasAccess ? handleRevokeAccess(u.id) : handleGrantAccess(u.id)
                          }
                        >
                          {hasAccess ? 'Revoke access' : 'Grant access'}
                        </button>
                      </div>
                    )
                  })}
                {users.filter((u) => u.role === 'viewer').length === 0 && (
                  <p className="empty-state">No viewers to grant access to yet.</p>
                )}
              </div>
            )}

            {selectedProperty && (
              <p className="property-meta">
                {accessProfileIds.size} viewer{accessProfileIds.size === 1 ? '' : 's'} currently
                have access to {selectedProperty.name}.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
