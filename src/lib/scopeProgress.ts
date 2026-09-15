// Shared, always-live scope-of-work progress math. Nothing here is ever
// stored — every percent is recomputed from the current scope_items rows
// each time it's needed, so the tree stays the single source of truth.
//
// Rule: a leaf item (no children) is 0% or 100% based on checked_at. A
// parent's percent is the plain average of its DIRECT children's percent,
// each child weighted equally no matter how many grandchildren it has. A
// property's overall percent is the same equal-weighted average of its
// Task (level-1) items.

import type { ScopeItem, ScopeItemAssignment } from '../types'

export function isChecked(item: ScopeItem): boolean {
  return !!item.checked_at
}

export function buildChildrenIndex(items: ScopeItem[]): Map<string, ScopeItem[]> {
  const index = new Map<string, ScopeItem[]>()
  for (const item of items) {
    if (!item.parent_id) continue
    const list = index.get(item.parent_id) ?? []
    list.push(item)
    index.set(item.parent_id, list)
  }
  for (const list of index.values()) list.sort((a, b) => a.position - b.position)
  return index
}

export function getDirectChildren(
  items: ScopeItem[],
  parentId: string,
  childrenIndex?: Map<string, ScopeItem[]>
): ScopeItem[] {
  const index = childrenIndex ?? buildChildrenIndex(items)
  return index.get(parentId) ?? []
}

export function computeItemPercent(
  item: ScopeItem,
  items: ScopeItem[],
  childrenIndex?: Map<string, ScopeItem[]>
): number {
  const index = childrenIndex ?? buildChildrenIndex(items)
  const children = index.get(item.id) ?? []
  if (children.length === 0) {
    return isChecked(item) ? 100 : 0
  }
  const total = children.reduce((sum, child) => sum + computeItemPercent(child, items, index), 0)
  return total / children.length
}

export function computePropertyPercent(items: ScopeItem[]): number {
  const index = buildChildrenIndex(items)
  const tasks = items.filter((i) => i.level === 1).sort((a, b) => a.position - b.position)
  if (tasks.length === 0) return 0
  const total = tasks.reduce((sum, task) => sum + computeItemPercent(task, items, index), 0)
  return total / tasks.length
}

function buildAsOfSnapshot(items: ScopeItem[], cutoff: Date): ScopeItem[] {
  const cutoffMs = cutoff.getTime()
  return items.map((item) =>
    item.checked_at && new Date(item.checked_at).getTime() > cutoffMs
      ? { ...item, checked_by: null, checked_at: null }
      : item
  )
}

// A snapshot of the property's percent "as of" a cutoff instant — used by
// the day-by-day report to show progress as it stood on a past date. Any
// checked_at after the cutoff is treated as not-yet-checked.
export function computePropertyPercentAsOf(items: ScopeItem[], cutoff: Date): number {
  return computePropertyPercent(buildAsOfSnapshot(items, cutoff))
}

// Same "as of" idea, for a single node instead of the whole property —
// used by report cards to show a header/sub-header's own cascading
// percent as it stood on a past date.
export function computeItemPercentAsOf(item: ScopeItem, items: ScopeItem[], cutoff: Date): number {
  const snapshot = buildAsOfSnapshot(items, cutoff)
  const snapshotItem = snapshot.find((i) => i.id === item.id) ?? item
  return computeItemPercent(snapshotItem, snapshot)
}

// "X of Y subtasks" — direct children only, counting a child as complete
// when its own computed percent is 100.
export function countCompleteDirectChildren(
  item: ScopeItem,
  items: ScopeItem[],
  childrenIndex?: Map<string, ScopeItem[]>
): { complete: number; total: number } {
  const index = childrenIndex ?? buildChildrenIndex(items)
  const children = index.get(item.id) ?? []
  const complete = children.filter((child) => computeItemPercent(child, items, index) === 100).length
  return { complete, total: children.length }
}

export function isLeafItem(
  item: ScopeItem,
  items: ScopeItem[],
  childrenIndex?: Map<string, ScopeItem[]>
): boolean {
  const index = childrenIndex ?? buildChildrenIndex(items)
  return (index.get(item.id) ?? []).length === 0
}

export function buildItemIndex(items: ScopeItem[]): Map<string, ScopeItem> {
  return new Map(items.map((item) => [item.id, item]))
}

// Walks parent_id up to the level-1 Task an item ultimately belongs to
// (an item is its own ancestor when it's already level 1).
export function getTopLevelAncestor(item: ScopeItem, itemsById: Map<string, ScopeItem>): ScopeItem {
  let current = item
  while (current.parent_id) {
    const parent = itemsById.get(current.parent_id)
    if (!parent) break
    current = parent
  }
  return current
}

// Decomposes computePropertyPercent into each leaf's fractional share
// (0..1, summing to 1 across every leaf) of the property's total 100%.
// Because the property percent is a chain of equal-weighted averages —
// 1/N1 per Task, 1/(N1*N2) per that Task's child, and so on down to each
// leaf — a leaf's weight is just the product of "1 / sibling count" at
// every level from the root down to it. Multiplying an unchecked leaf's
// weight by 100 gives exactly the percentage points the property total
// would gain if that one leaf were checked — its "weighted contribution".
export function computeLeafWeights(items: ScopeItem[]): Map<string, number> {
  const index = buildChildrenIndex(items)
  const tasks = items.filter((i) => i.level === 1).sort((a, b) => a.position - b.position)
  const weights = new Map<string, number>()
  if (tasks.length === 0) return weights

  function assign(item: ScopeItem, weight: number) {
    const children = index.get(item.id) ?? []
    if (children.length === 0) {
      weights.set(item.id, weight)
      return
    }
    const childWeight = weight / children.length
    for (const child of children) assign(child, childWeight)
  }

  const taskWeight = 1 / tasks.length
  for (const task of tasks) assign(task, taskWeight)

  return weights
}

export const UNASSIGNED_KEY = 'unassigned'

// For every unchecked leaf, splits its weighted contribution to the
// property total (see computeLeafWeights) evenly across its currently
// active assignees — or files it under UNASSIGNED_KEY when it has none
// — then sums each person's total across all their pending leaves.
// Values are percentage points (0..100); they sum to the property's
// total percent remaining (100 - overall percent).
export function computeRemainingWeightByAssignee(
  items: ScopeItem[],
  activeAssignments: ScopeItemAssignment[]
): Map<string, number> {
  const weights = computeLeafWeights(items)
  const assigneesByItem = new Map<string, string[]>()
  for (const a of activeAssignments) {
    if (a.unassigned_at) continue
    const list = assigneesByItem.get(a.scope_item_id) ?? []
    list.push(a.profile_id)
    assigneesByItem.set(a.scope_item_id, list)
  }

  const totals = new Map<string, number>()
  for (const item of items) {
    if (item.checked_at) continue
    const weight = weights.get(item.id)
    if (weight === undefined) continue // not a leaf
    const points = weight * 100
    const assignees = assigneesByItem.get(item.id) ?? []
    if (assignees.length === 0) {
      totals.set(UNASSIGNED_KEY, (totals.get(UNASSIGNED_KEY) ?? 0) + points)
    } else {
      const share = points / assignees.length
      for (const profileId of assignees) {
        totals.set(profileId, (totals.get(profileId) ?? 0) + share)
      }
    }
  }
  return totals
}
