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

// Past entries only carry the `timed` flag if they were logged after the
// exercise was switched. Treat an entry as timed whenever its exercise is
// timed now, so a plank logged back when it was plain "reps" reads in
// seconds too. Falls back to the entry's own flag if the exercise is gone.
export function applyCurrentTimed(sessions, exercises) {
  const byId = new Map((exercises || []).map((e) => [e.id, e]))
  return (sessions || []).map((s) => ({
    ...s,
    entries: (s.entries || []).map((e) => {
      if (e.category === 'cardio') return e
      const ex = e.exerciseId ? byId.get(e.exerciseId) : null
      const timed = ex ? !!ex.timed : !!e.timed
      return timed === !!e.timed ? e : { ...e, timed, ...(timed ? { bodyweight: true } : {}) }
    }),
  }))
}
