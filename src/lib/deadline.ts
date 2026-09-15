// Shared deadline math used everywhere a deadline is shown — the property
// page and every Task's detail page.

// "deadline minus today", floored at 0. Both dates are treated as
// midnight-local so a deadline of "today" reads as 0 days left.
export function daysLeftFromDeadline(deadline: string | null, now: Date = new Date()): number | null {
  if (!deadline) return null
  const [y, m, d] = deadline.split('-').map(Number)
  const deadlineDate = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((deadlineDate.getTime() - today.getTime()) / 86400000)
  return Math.max(0, diffDays)
}

// (100 - current%) / days left, rounded to 1 decimal. Undefined once the
// deadline has arrived (0 days left) rather than dividing by zero.
export function targetPercentPerDay(currentPercent: number, daysLeft: number | null): number | null {
  if (daysLeft === null || daysLeft <= 0) return null
  const remaining = Math.max(0, 100 - currentPercent)
  return Math.round((remaining / daysLeft) * 10) / 10
}

export function formatDeadlineDate(deadline: string): string {
  const [y, m, d] = deadline.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
