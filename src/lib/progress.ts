// Shared progress-bar math used by the live checklist (ProgressBar.tsx),
// the on-screen report, and the PDF export, so all three always agree.

export function formatPercent(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent))
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1)
}

export interface Rgb {
  r: number
  g: number
  b: number
}

// Red below 10%, yellow below 50%, then a green that gets progressively
// lighter as it approaches 100%.
export function progressColorRgb(percent: number): Rgb {
  if (percent < 10) return { r: 211, g: 47, b: 47 }
  if (percent < 50) return { r: 245, g: 166, b: 35 }
  const t = Math.min(1, Math.max(0, (percent - 50) / 50))
  const start = { r: 46, g: 125, b: 50 }
  const end = { r: 165, g: 214, b: 167 }
  return {
    r: Math.round(start.r + (end.r - start.r) * t),
    g: Math.round(start.g + (end.g - start.g) * t),
    b: Math.round(start.b + (end.b - start.b) * t),
  }
}

export function progressColorCss(percent: number): string {
  const { r, g, b } = progressColorRgb(percent)
  return `rgb(${r}, ${g}, ${b})`
}
