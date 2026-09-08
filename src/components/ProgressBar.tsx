import { formatPercent, progressColorCss } from '../lib/progress'

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent))
  const color = progressColorCss(clamped)

  return (
    <div className="progress-battery-wrap">
      {label && <div className="progress-label">{label}</div>}
      <div
        className="progress-battery"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-battery-body">
          <div className="progress-battery-fill" style={{ width: `${clamped}%`, background: color }} />
          <span className="progress-battery-text">{formatPercent(clamped)}%</span>
        </div>
        <div className="progress-battery-nub" />
      </div>
    </div>
  )
}
