// Builds the "one card per calendar day" report structure shared by the
// on-screen Reports page and the PDF export, so both always match.

import type { Entry, ScopeHeader, ScopePoint } from '../types'

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

function endOfDayCutoff(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
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

export interface DayChecklistSection {
  headerId: string
  headerTitle: string
  points: { id: string; title: string; checkedAt: string }[]
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

// dateKeys need not be sorted or de-duplicated by the caller.
export function buildDayReports(
  dateKeys: string[],
  entries: Entry[],
  headers: ScopeHeader[],
  points: ScopePoint[],
  photoUrlResolver: (path: string) => string
): DayReport[] {
  const sortedDateKeys = [...new Set(dateKeys)].sort()
  const totalPoints = points.length
  const headerOrder = new Map(headers.map((h, i) => [h.id, i]))
  const orderedHeaders = [...headers].sort((a, b) => a.position - b.position)

  return sortedDateKeys.map((dateKey) => {
    const cutoff = endOfDayCutoff(dateKey)

    const checkedUpToDay = points.filter(
      (p) => p.checked_at && new Date(p.checked_at).getTime() <= cutoff
    )
    const progressPercent =
      totalPoints === 0 ? 0 : Math.round((checkedUpToDay.length / totalPoints) * 1000) / 10

    const pointsCheckedThisDay = points.filter((p) => p.checked_at && toDateKey(p.checked_at) === dateKey)
    const sectionsByHeader = new Map<string, DayChecklistSection>()
    for (const point of pointsCheckedThisDay) {
      const header = orderedHeaders.find((h) => h.id === point.header_id)
      if (!header) continue
      if (!sectionsByHeader.has(header.id)) {
        sectionsByHeader.set(header.id, { headerId: header.id, headerTitle: header.title, points: [] })
      }
      sectionsByHeader.get(header.id)!.points.push({
        id: point.id,
        title: point.title,
        checkedAt: point.checked_at!,
      })
    }
    const checklistSections = [...sectionsByHeader.values()].sort(
      (a, b) => (headerOrder.get(a.headerId) ?? 0) - (headerOrder.get(b.headerId) ?? 0)
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
