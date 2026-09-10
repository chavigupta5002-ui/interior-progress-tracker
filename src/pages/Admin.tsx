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

const selectClass =
  'h-10 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:opacity-50'

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
    <div>
      <h1 className="mb-5 text-3xl font-bold text-gray-900">Admin</h1>

      <section className="mb-5 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
        <h2 className="text-base font-semibold text-gray-900">User roles</h2>
        <p className="mt-1 mb-3 text-sm text-gray-500">
          Promote a viewer to project manager, or grant/remove admin access.
        </p>

        {usersError && <p className="mb-3 text-sm text-red-600">{usersError}</p>}

        {usersLoading ? (
          <p className="text-sm text-gray-500">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No users found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-gray-800">
                  {u.display_name}
                  {u.id === profile?.id && <span className="font-normal text-gray-400"> (you)</span>}
                </span>
                <select
                  value={u.role}
                  disabled={savingUserId === u.id}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                  className={selectClass}
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

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
        <h2 className="text-base font-semibold text-gray-900">Property access</h2>
        <p className="mt-1 mb-3 text-sm text-gray-500">
          Admins and project managers can already see every property. Grant viewers access to a specific
          property here.
        </p>

        {properties.length === 0 ? (
          <p className="text-sm text-gray-500">No properties yet.</p>
        ) : (
          <>
            <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Property
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {accessError && <p className="mb-3 text-sm text-red-600">{accessError}</p>}

            {accessLoading ? (
              <p className="text-sm text-gray-500">Loading access…</p>
            ) : (
              <div className="flex flex-col gap-2">
                {users
                  .filter((u) => u.role === 'viewer')
                  .map((u) => {
                    const hasAccess = accessProfileIds.has(u.id)
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
                      >
                        <span className="text-sm font-medium text-gray-800">{u.display_name}</span>
                        <button
                          type="button"
                          className={
                            hasAccess
                              ? 'rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                              : 'rounded-lg bg-[#FFD700] px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-50'
                          }
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
                  <p className="text-sm text-gray-500">No viewers to grant access to yet.</p>
                )}
              </div>
            )}

            {selectedProperty && (
              <p className="mt-3 text-xs text-gray-400">
                {accessProfileIds.size} viewer{accessProfileIds.size === 1 ? '' : 's'} currently have
                access to {selectedProperty.name}.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
