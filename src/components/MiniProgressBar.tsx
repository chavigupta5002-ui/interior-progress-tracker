import { formatPercent } from '../lib/progress'
import { progressColorClass } from '../lib/progressColor'

// A small inline progress bar for a header/sub-header row in a report
// card — same red/yellow/green rule as BatteryProgressBar, just at
// label scale instead of full-width.
export function MiniProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <span className="flex flex-shrink-0 items-center gap-1.5">
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`block h-full rounded-full ${progressColorClass(clamped)}`} style={{ width: `${clamped}%` }} />
      </span>
      <span className="text-[11px] font-medium text-gray-500">{formatPercent(clamped)}%</span>
    </span>
  )
}
