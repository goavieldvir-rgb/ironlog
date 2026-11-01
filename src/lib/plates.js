// Plate math for a loaded barbell: what goes on each side to hit a total.
// Bar weights and plate sets match the usual gym kit (and warmup.js's bar).
export const BAR = { kg: 20, lb: 45 }
const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

// Greedy, heaviest plate first. Returns null when the total is no more than
// the empty bar. `rest` is whatever the smallest plate can't cover (per
// side), so the caller can flag a weight that isn't loadable exactly.
export function platesPerSide(total, unit) {
  const key = unit === 'lb' ? 'lb' : 'kg'
  const w = Number(total)
  if (!isFinite(w) || w <= BAR[key]) return null
  let left = Math.round(((w - BAR[key]) / 2) * 100) / 100
  const plates = []
  for (const p of PLATES[key]) {
    while (left + 1e-9 >= p) {
      plates.push(p)
      left = Math.round((left - p) * 100) / 100
    }
  }
  return { plates, rest: left }
}

// Dumbbells, machines, cables and the like never take plates this way, so the
// readout is for everything else. Judged by name since there is no equipment
// field; a miss only costs a line that isn't useful, never a wrong number.
const NOT_BARBELL = /dumbbell|\bdb\b|machine|cable|smith|kettlebell|\bkb\b|pulldown|pushdown|pec deck|leg press|משקולות יד|משקולת יד|מכונה|כבל|קטלבל|סמית/i
export const isBarbellLift = (...names) => {
  const n = names.filter(Boolean).join(' ')
  return !!n && !NOT_BARBELL.test(n)
}
