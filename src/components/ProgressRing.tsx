import { formatPercent } from '../lib/progress'

// Same red/yellow/green thresholds as BatteryProgressBar, as hex since
// SVG stroke doesn't take Tailwind classes.
function ringColor(percent: number): string {
  if (percent < 10) return '#ef4444' // red-500
  if (percent < 50) return '#facc15' // yellow-400
  return '#059669' // emerald-600
}

export function ProgressRing({
  percent,
  size = 100,
  strokeWidth = 10,
}: {
  percent: number
  size?: number
  strokeWidth?: number
}) {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor(clamped)}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-lg font-bold text-gray-900">{formatPercent(clamped)}%</span>
    </div>
  )
}
