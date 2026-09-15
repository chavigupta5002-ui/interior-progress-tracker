// Builds the "one card per calendar day" report structure shared by the
// on-screen Reports page and the PDF export, so both always match.

import type { Entry, ScopeItem } from '../types'
import { buildItemIndex, computePropertyPercentAsOf, getTopLevelAncestor } from './scopeProgress'

export function toDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function endOfDayCutoff(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

// Every calendar day from start to end, inclusive.
export function enumerateDateRange(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const last = new Date(ey, em - 1, ed)
  const result: string[] = []
  while (cur.getTime() <= last.getTime()) {
    result.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    )
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

// Items checked on a given day, rolled up under their top-level Task —
// walking the 3-level tree so a checked Subtask or Sub-subtask still
// lands in the right Task's section.
export interface DayChecklistSection {
  taskId: string
  taskTitle: string
  items: { id: string; title: string; checkedAt: string }[]
}

export interface DayNote {
  entryId: string
  note: string
  createdAt: string
  uploaderName: string
}

export interface DayReport {
  dateKey: string
  dateLabel: string
  progressPercent: number
  checklistSections: DayChecklistSection[]
  photoUrls: string[]
  notes: DayNote[]
}

// dateKeys need not be sorted or de-duplicated by the caller. Days come
// out most-recent-first (reverse chronological), matching the property
// timeline's newest-first order.
export function buildDayReports(
  dateKeys: string[],
  entries: Entry[],
  scopeItems: ScopeItem[],
  photoUrlResolver: (path: string) => string
): DayReport[] {
  const sortedDateKeys = [...new Set(dateKeys)].sort().reverse()
  const byId = buildItemIndex(scopeItems)
  const tasks = [...scopeItems.filter((i) => i.level === 1)].sort((a, b) => a.position - b.position)
  const taskOrder = new Map(tasks.map((task, index) => [task.id, index]))

  return sortedDateKeys.map((dateKey) => {
    const cutoff = endOfDayCutoff(dateKey)
    const progressPercent = Math.round(computePropertyPercentAsOf(scopeItems, cutoff) * 10) / 10

    const checkedThisDay = scopeItems.filter((item) => item.checked_at && toDateKey(item.checked_at) === dateKey)
    const sectionsByTask = new Map<string, DayChecklistSection>()
    for (const item of checkedThisDay) {
      const task = getTopLevelAncestor(item, byId)
      if (!sectionsByTask.has(task.id)) {
        sectionsByTask.set(task.id, { taskId: task.id, taskTitle: task.title, items: [] })
      }
      sectionsByTask.get(task.id)!.items.push({ id: item.id, title: item.title, checkedAt: item.checked_at! })
    }
    const checklistSections = [...sectionsByTask.values()].sort(
      (a, b) => (taskOrder.get(a.taskId) ?? 0) - (taskOrder.get(b.taskId) ?? 0)
    )

    const entriesThisDay = entries.filter((e) => toDateKey(e.created_at) === dateKey)
    const photoUrls = entriesThisDay.flatMap((e) => (e.photo_paths ?? []).map(photoUrlResolver))
    const notes = entriesThisDay
      .filter((e) => e.show_in_report && e.note.trim())
      .map((e) => ({ entryId: e.id, note: e.note, createdAt: e.created_at, uploaderName: e.uploader_name }))

    return {
      dateKey,
      dateLabel: dateKeyLabel(dateKey),
      progressPercent,
      checklistSections,
      photoUrls,
      notes,
    }
  })
}
