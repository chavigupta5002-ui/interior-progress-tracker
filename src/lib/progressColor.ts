// The single red/yellow/green threshold rule used by every progress
// visualization in the app: red below 10%, yellow below 50%, green on
// up toward 100%.

export function progressColorClass(percent: number): string {
  if (percent < 10) return 'bg-red-500'
  if (percent < 50) return 'bg-yellow-400'
  return 'bg-emerald-600'
}

export function progressColorHex(percent: number): string {
  if (percent < 10) return '#ef4444' // red-500
  if (percent < 50) return '#facc15' // yellow-400
  return '#059669' // emerald-600
}
