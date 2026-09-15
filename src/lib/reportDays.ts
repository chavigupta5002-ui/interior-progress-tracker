// Builds the "one card per calendar day" report structure shared by the
// on-screen Reports page and the PDF export, so both always match.

import type { Entry, ScopeItem } from '../types'
import { buildItemIndex, computeItemPercentAsOf, computePropertyPercentAsOf, getTopLevelAncestor } from './scopeProgress'

export function toDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayDateKey(): string {
  const d = new Date()
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

export interface DayChecklistItem {
  id: string
  title: string
  checkedAt: string
  checkedBy: string | null
}

// A level-2 Subtask acting as a sub-header for level-3 items checked
// under it that day, with its own cascading percent (as of that day).
export interface DaySubHeaderGroup {
  subtaskId: string
  subtaskTitle: string
  percent: number
  items: DayChecklistItem[]
}

// Items checked on a given day, rolled up under their top-level Task —
// walking the 3-level tree so a checked Subtask or Sub-subtask still
// lands in the right Task's section. A leaf checked directly under the
// Task (a childless level-2 Subtask) lands in directItems; a level-3
// item lands in its immediate Subtask's subHeaderGroup instead.
export interface DayChecklistSection {
  taskId: string
  taskTitle: string
  percent: number
  directItems: DayChecklistItem[]
  subHeaderGroups: DaySubHeaderGroup[]
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

    interface WorkingSection {
      taskId: string
      taskTitle: string
      directItems: DayChecklistItem[]
      subHeaderGroups: Map<string, DaySubHeaderGroup>
    }
    const sectionsByTask = new Map<string, WorkingSection>()

    for (const item of checkedThisDay) {
      const task = getTopLevelAncestor(item, byId)
      if (!sectionsByTask.has(task.id)) {
        sectionsByTask.set(task.id, {
          taskId: task.id,
          taskTitle: task.title,
          directItems: [],
          subHeaderGroups: new Map(),
        })
      }
      const section = sectionsByTask.get(task.id)!
      const checklistItem: DayChecklistItem = {
        id: item.id,
        title: item.title,
        checkedAt: item.checked_at!,
        checkedBy: item.checked_by,
      }

      const parent = item.parent_id ? byId.get(item.parent_id) : undefined
      if (parent && parent.id !== task.id) {
        // A level-3 item — group under its immediate Subtask (sub-header).
        if (!section.subHeaderGroups.has(parent.id)) {
          section.subHeaderGroups.set(parent.id, {
            subtaskId: parent.id,
            subtaskTitle: parent.title,
            percent: Math.round(computeItemPercentAsOf(parent, scopeItems, cutoff) * 10) / 10,
            items: [],
          })
        }
        section.subHeaderGroups.get(parent.id)!.items.push(checklistItem)
      } else {
        // A childless level-2 Subtask checked directly under the Task.
        section.directItems.push(checklistItem)
      }
    }

    const checklistSections: DayChecklistSection[] = [...sectionsByTask.values()]
      .sort((a, b) => (taskOrder.get(a.taskId) ?? 0) - (taskOrder.get(b.taskId) ?? 0))
      .map((section) => ({
        taskId: section.taskId,
        taskTitle: section.taskTitle,
        percent: Math.round(computeItemPercentAsOf(byId.get(section.taskId)!, scopeItems, cutoff) * 10) / 10,
        directItems: section.directItems,
        subHeaderGroups: [...section.subHeaderGroups.values()],
      }))

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
