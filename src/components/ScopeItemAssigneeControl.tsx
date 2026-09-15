import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { assignProfileToScopeItem, unassignProfileFromScopeItem } from '../lib/scopeActions'
import type { Profile, ScopeItem, ScopeItemAssignment } from '../types'
import { UserPlus } from 'lucide-react'

function formatAssignedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Admin/PM-only: the grey "Assigned to ..." line under a scope point's
// title, plus a small control to assign/unassign people on it. Never
// rendered for viewers.
export function ScopeItemAssigneeControl({
  item,
  propertyId,
  propertyName,
  actorId,
  managerProfiles,
  nameById,
  assignments,
  setAssignments,
}: {
  item: ScopeItem
  propertyId: string
  propertyName: string
  actorId: string
  managerProfiles: Profile[]
  nameById: Map<string, string>
  assignments: ScopeItemAssignment[]
  setAssignments: Dispatch<SetStateAction<ScopeItemAssignment[]>>
}) {
  const [open, setOpen] = useState(false)
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeForItem = assignments.filter((a) => a.scope_item_id === item.id && !a.unassigned_at)
  const assignedProfileIds = new Set(activeForItem.map((a) => a.profile_id))
  const mostRecentAssignedAt = activeForItem.reduce<string | null>(
    (latest, a) => (!latest || a.assigned_at > latest ? a.assigned_at : latest),
    null
  )

  async function handleToggleProfile(profile: Profile) {
    setBusyProfileId(profile.id)
    setError(null)
    try {
      if (assignedProfileIds.has(profile.id)) {
        const activeRow = activeForItem.find((a) => a.profile_id === profile.id)!
        const updated = await unassignProfileFromScopeItem({
          assignmentId: activeRow.id,
          item,
          profileId: profile.id,
          actorId,
          propertyId,
          propertyName,
        })
        setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      } else {
        const created = await assignProfileToScopeItem({
          item,
          profileId: profile.id,
          actorId,
          propertyId,
          propertyName,
        })
        setAssignments((prev) => [...prev, created])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyProfileId(null)
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {activeForItem.length > 0 && (
        <span className="text-xs text-gray-500">
          Assigned to {activeForItem.map((a) => nameById.get(a.profile_id) ?? 'Someone').join(', ')}
          {mostRecentAssignedAt && ` · ${formatAssignedDate(mostRecentAssignedAt)}`}
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
          onClick={() => setOpen((v) => !v)}
        >
          <UserPlus size={12} />
          Assign
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 w-52 rounded-lg border border-gray-100 bg-white p-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
              {managerProfiles.length === 0 ? (
                <p className="px-1 py-1 text-xs text-gray-500">No admins or PMs found.</p>
              ) : (
                <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {managerProfiles.map((profile) => {
                    const checked = assignedProfileIds.has(profile.id)
                    return (
                      <label
                        key={profile.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-300"
                          checked={checked}
                          disabled={busyProfileId === profile.id}
                          onChange={() => handleToggleProfile(profile)}
                        />
                        {profile.display_name}
                      </label>
                    )
                  })}
                </div>
              )}
              {error && <p className="mt-1 px-1 text-xs text-red-600">{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
