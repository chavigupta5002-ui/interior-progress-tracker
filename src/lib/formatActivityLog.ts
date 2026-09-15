// Turns one activity_logs row into the sentence the Logs page shows,
// e.g. "Nakul checked off 'Chairs' in Furniture · Sunset Villa · Sep 15,
// 2026, 3:42 PM". Prefers a live join (current item/header/property
// names) and falls back to the note snapshot taken at the time of the
// action whenever the point or property can no longer be resolved.

import type { ActivityLog, Profile, Property, ScopeItem } from '../types'
import { getTopLevelAncestor } from './scopeProgress'

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}

export function formatActivityLogLine(
  log: ActivityLog,
  ctx: {
    profilesById: Map<string, Profile>
    propertiesById: Map<string, Property>
    itemsById: Map<string, ScopeItem>
  }
): string {
  const actorName = ctx.profilesById.get(log.actor_id)?.display_name ?? 'Someone'
  const when = formatTimestamp(log.created_at)
  const property = ctx.propertiesById.get(log.property_id)

  if (log.action === 'entry_created') {
    const propertyName = property?.name ?? log.note ?? 'a property'
    return `${actorName} added a new update in ${propertyName} · ${when}`
  }

  if (log.action === 'item_deleted') {
    // scope_item_id is always null for these — the note (the item's full
    // tree path, e.g. "Furniture > Chair") is the only record left.
    const path = log.note ?? 'a scope item'
    const propertySegment = property ? ` · ${property.name}` : ''
    return `${actorName} deleted '${path}'${propertySegment} · ${when}`
  }

  if (log.action === 'item_renamed') {
    // note is self-contained ("Old title → New title (Full > Path)") so
    // this reads fine even if the item has since been deleted or moved.
    const summary = log.note ?? 'a scope item'
    const propertySegment = property ? ` · ${property.name}` : ''
    return `${actorName} renamed ${summary}${propertySegment} · ${when}`
  }

  const item = log.scope_item_id ? ctx.itemsById.get(log.scope_item_id) : undefined

  if (item && property) {
    const header = getTopLevelAncestor(item, ctx.itemsById)
    const headerSegment = header.id !== item.id ? ` in ${header.title}` : ''
    const targetName = log.target_profile_id
      ? (ctx.profilesById.get(log.target_profile_id)?.display_name ?? 'someone')
      : 'someone'

    const verb =
      log.action === 'item_checked'
        ? 'checked off'
        : log.action === 'item_unchecked'
          ? 'unchecked'
          : log.action === 'item_assigned'
            ? `assigned ${targetName} to`
            : `unassigned ${targetName} from`

    return `${actorName} ${verb} '${item.title}'${headerSegment} · ${property.name} · ${when}`
  }

  // The point and/or property no longer exist — fall back to the note
  // snapshotted at the time of the action.
  return `${actorName} — ${log.note ?? 'activity'} · ${when}`
}
