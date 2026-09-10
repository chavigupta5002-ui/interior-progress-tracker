// Shared percent formatting used by the live checklist (ProgressBar.tsx),
// the on-screen report, and the PDF export, so all three always agree.

export function formatPercent(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent))
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1)
}
