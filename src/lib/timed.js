// Timed exercises (plank, wall sit, dead hang) are bodyweight-style: the
// main number of each set is seconds held, stored in the set's existing
// `reps` field, and added weight stays optional. Keeping seconds in `reps`
// means saving, last-time numbers, PRs and charts all work without any new
// set fields — only the labels change.

// 45 -> "45s", 90 -> "1:30".
export function formatSeconds(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n) || n < 0) return ''
  if (n < 60) return `${n}s`
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
