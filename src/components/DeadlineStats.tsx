import { daysLeftFromDeadline, formatDeadlineDate, targetPercentPerDay } from '../lib/deadline'

// Reusable deadline block: date, plus derived Days Left / Target %/day.
// Used by both the property page and every Task detail page. When no
// deadline is set, the derived stats are hidden entirely rather than
// showing a placeholder.
export function DeadlineStats({
  deadline,
  percent,
  editable = false,
  onChangeDeadline,
  saving = false,
}: {
  deadline: string | null
  percent: number
  editable?: boolean
  onChangeDeadline?: (value: string | null) => void
  saving?: boolean
}) {
  const daysLeft = daysLeftFromDeadline(deadline)
  const targetPerDay = targetPercentPerDay(percent, daysLeft)

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-500">Deadline</span>
        {editable ? (
          <input
            type="date"
            value={deadline ?? ''}
            disabled={saving}
            onChange={(e) => onChangeDeadline?.(e.target.value || null)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:opacity-50"
          />
        ) : (
          <span className={`text-sm font-semibold ${deadline ? 'text-gray-700' : 'text-gray-300'}`}>
            {deadline ? formatDeadlineDate(deadline) : 'Not set'}
          </span>
        )}
      </div>

      {daysLeft !== null && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Days Left</span>
          <span className="text-sm font-semibold text-gray-900">{daysLeft}</span>
        </div>
      )}

      {targetPerDay !== null && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Target %/day</span>
          <span className="text-sm font-semibold text-gray-900">{targetPerDay}%</span>
        </div>
      )}
    </div>
  )
}
