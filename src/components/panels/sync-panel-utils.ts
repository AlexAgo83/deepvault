export function formatDuration(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms))
  if (safeMs < 1000) return `${safeMs}ms`
  const s = Math.floor(safeMs / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
