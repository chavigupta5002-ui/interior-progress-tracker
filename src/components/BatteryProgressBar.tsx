import { formatPercent } from '../lib/progress'

// Red below 10%, yellow below 50%, green on up toward 100%.
function progressBarColorClass(percent: number): string {
  if (percent < 10) return 'bg-red-500'
  if (percent < 50) return 'bg-yellow-400'
  return 'bg-emerald-600'
}

export function BatteryProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm font-bold text-gray-900">{formatPercent(clamped)}%</span>
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${progressBarColorClass(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
