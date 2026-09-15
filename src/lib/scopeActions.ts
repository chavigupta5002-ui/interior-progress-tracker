// The single code path for check/uncheck, assign/unassign, so every
// caller (Task detail, Subtask detail, the KPI page's inline checklist)
// writes the same shape of activity_logs row. The primary write (the
// scope_items or scope_item_assignments change) throws on failure so
// callers can roll back their optimistic UI update; the activity_logs
// write is best-effort — a logging hiccup never undoes a change that
// already succeeded, it's just reported to the console.

import { supabase } from './supabaseClient'
import { buildItemIndex, getAllDescendants, getItemPath } from './scopeProgress'
import type { ActivityAction, ScopeItem, ScopeItemAssignment } from '../types'

async function logActivity(params: {
  propertyId: string
  actorId: string
  action: ActivityAction
  scopeItemId?: string | null
  targetProfileId?: string | null
  note?: string | null
}): Promise<void> {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      property_id: params.propertyId,
      scope_item_id: params.scopeItemId ?? null,
      actor_id: params.actorId,
      target_profile_id: params.targetProfileId ?? null,
      action: params.action,
      note: params.note ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.error(`Failed to log activity "${params.action}"`, err)
  }
}

// Toggles a scope item's checked state, logs item_checked/item_unchecked.
export async function toggleScopeItemChecked(params: {
  item: ScopeItem
  actorId: string
  propertyId: string
  propertyName: string
}): Promise<{ checked_by: string | null; checked_at: string | null }> {
  const { item, actorId, propertyId, propertyName } = params
  const checking = !item.checked_at
  const patch = checking
    ? { checked_by: actorId, checked_at: new Date().toISOString() }
    : { checked_by: null, checked_at: null }

  const { error } = await supabase.from('scope_items').update(patch).eq('id', item.id)
  if (error) throw error

  await logActivity({
    propertyId,
    actorId,
    action: checking ? 'item_checked' : 'item_unchecked',
    scopeItemId: item.id,
    note: `${item.title} · ${propertyName}`,
  })

  return patch
}

// Assigns a profile to a scope item, logs item_assigned. Returns the
// inserted row so the caller can upsert it into local state.
export async function assignProfileToScopeItem(params: {
  item: ScopeItem
  profileId: string
  actorId: string
  propertyId: string
  propertyName: string
}): Promise<ScopeItemAssignment> {
  const { item, profileId, actorId, propertyId, propertyName } = params
  const { data, error } = await supabase
    .from('scope_item_assignments')
    .insert({ scope_item_id: item.id, profile_id: profileId, assigned_by: actorId })
    .select()
    .single()
  if (error) throw error

  await logActivity({
    propertyId,
    actorId,
    action: 'item_assigned',
    scopeItemId: item.id,
    targetProfileId: profileId,
    note: `${item.title} · ${propertyName}`,
  })

  return data as ScopeItemAssignment
}

// Ends an active assignment (sets unassigned_at, never deletes the row),
// logs item_unassigned. Returns the updated row.
export async function unassignProfileFromScopeItem(params: {
  assignmentId: string
  item: ScopeItem
  profileId: string
  actorId: string
  propertyId: string
  propertyName: string
}): Promise<ScopeItemAssignment> {
  const { assignmentId, item, profileId, actorId, propertyId, propertyName } = params
  const { data, error } = await supabase
    .from('scope_item_assignments')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .select()
    .single()
  if (error) throw error

  await logActivity({
    propertyId,
    actorId,
    action: 'item_unassigned',
    scopeItemId: item.id,
    targetProfileId: profileId,
    note: `${item.title} · ${propertyName}`,
  })

  return data as ScopeItemAssignment
}

// Deletes a scope item and all its descendants (the database cascades
// the delete via scope_items.parent_id's ON DELETE CASCADE — this issues
// exactly one DELETE for the target row) and logs one item_deleted row
// per deleted item, admin-only. The note snapshots each item's full tree
// path since scope_item_id goes null the moment its row is gone.
export async function deleteScopeItemWithDescendants(params: {
  item: ScopeItem
  items: ScopeItem[]
  actorId: string
  propertyId: string
}): Promise<void> {
  const { item, items, actorId, propertyId } = params
  const itemsById = buildItemIndex(items)
  const deleted = [item, ...getAllDescendants(item, items)]

  const { error } = await supabase.from('scope_items').delete().eq('id', item.id)
  if (error) throw error

  try {
    const rows = deleted.map((deletedItem) => ({
      property_id: propertyId,
      scope_item_id: null,
      actor_id: actorId,
      target_profile_id: null,
      action: 'item_deleted' as ActivityAction,
      note: getItemPath(deletedItem, itemsById),
    }))
    const { error: logError } = await supabase.from('activity_logs').insert(rows)
    if (logError) throw logError
  } catch (err) {
    console.error('Failed to log activity "item_deleted"', err)
  }
}

// Renames a scope item and logs item_renamed with a self-contained note
// ("Old title → New title (Full > Path)") so the Logs page stays
// readable even if the item is later deleted or moved. A no-op (no DB
// write, no log) when the trimmed title is unchanged.
export async function renameScopeItem(params: {
  item: ScopeItem
  items: ScopeItem[]
  newTitle: string
  actorId: string
  propertyId: string
}): Promise<void> {
  const { item, items, newTitle, actorId, propertyId } = params
  const trimmed = newTitle.trim()
  if (!trimmed || trimmed === item.title) return

  const { error } = await supabase.from('scope_items').update({ title: trimmed }).eq('id', item.id)
  if (error) throw error

  const itemsById = buildItemIndex(items)
  const renamedItem = { ...item, title: trimmed }
  itemsById.set(item.id, renamedItem)
  const path = getItemPath(renamedItem, itemsById)

  await logActivity({
    propertyId,
    actorId,
    action: 'item_renamed',
    scopeItemId: item.id,
    note: `${item.title} → ${trimmed} (${path})`,
  })
}

// Logs a new photo/note entry — called from PhotoUploadForm right after
// the entries insert succeeds.
export async function logEntryCreated(params: {
  propertyId: string
  actorId: string
  propertyName: string
}): Promise<void> {
  await logActivity({
    propertyId: params.propertyId,
    actorId: params.actorId,
    action: 'entry_created',
    note: params.propertyName,
  })
}
