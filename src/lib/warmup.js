// Warm-up sets are flagged with `warmup: true` on the set itself (sets live
// in jsonb, so no migration). They're shown, but never count toward PRs,
// "last time" numbers, volume or set counts.
export const isWarmup = (set) => !!set?.warmup
export const workingSets = (sets) => (sets || []).filter((s) => !isWarmup(s))

// A simple ramp toward the working weight: the empty bar for 10, then
// 50% x5, 70% x3 and 85% x2, each rounded down to a loadable step (the
// smallest plate jump). Steps at or below the bar are skipped (the bar
// already covers them), and so is anything that isn't lighter than the
// working weight — a warm-up should never be as heavy as the real set.
export function suggestWarmups(workingWeight, unit) {
  const w = Number(workingWeight)
  if (!isFinite(w) || w <= 0) return []
  const lb = unit === 'lb'
  const bar = lb ? 45 : 20
  const step = lb ? 5 : 2.5
  const ladder = [
    { pct: 0.5, reps: 5 },
    { pct: 0.7, reps: 3 },
    { pct: 0.85, reps: 2 },
  ]
  let steps = ladder.map(({ pct, reps }) => ({ weight: Math.floor((w * pct) / step) * step, reps }))
  if (w > bar) {
    steps = [{ weight: bar, reps: 10 }, ...steps.filter((s) => s.weight > bar)]
  }
  const seen = new Set()
  return steps.filter((s) => {
    if (s.weight >= w || s.weight <= 0 || seen.has(s.weight)) return false
    seen.add(s.weight)
    return true
  })
}
