// Shared, always-live scope-of-work progress math. Nothing here is ever
// stored — every percent is recomputed from the current scope_items rows
// each time it's needed, so the tree stays the single source of truth.
//
// Rule: a leaf item (no children) is 0% or 100% based on checked_at. A
// parent's percent is the plain average of its DIRECT children's percent,
// each child weighted equally no matter how many grandchildren it has. A
// property's overall percent is the same equal-weighted average of its
// Task (level-1) items.

import type { ScopeItem } from '../types'

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

// A snapshot of the property's percent "as of" a cutoff instant — used by
// the day-by-day report to show progress as it stood on a past date. Any
// checked_at after the cutoff is treated as not-yet-checked.
export function computePropertyPercentAsOf(items: ScopeItem[], cutoff: Date): number {
  const cutoffMs = cutoff.getTime()
  const snapshot = items.map((item) =>
    item.checked_at && new Date(item.checked_at).getTime() > cutoffMs
      ? { ...item, checked_by: null, checked_at: null }
      : item
  )
  return computePropertyPercent(snapshot)
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
