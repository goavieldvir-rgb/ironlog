// Turns a just-saved workout into the handful of numbers shown on the
// "Workout saved" screen and the share card. Warm-ups never count, matching
// the rest of the app. Everything is derived from the workout's own entries
// plus the all-time bests that were known before it was saved.
import { workingSets } from './warmup.js'
import { cardioSummary, formatPace, formatDistance } from './cardio.js'
import { formatSeconds } from './timed.js'

const num = (v) => {
  const n = Number(v)
  return v !== '' && v != null && isFinite(n) ? n : 0
}

// The number a record is judged on, same rule as the workout screen.
function prValue(entry, set) {
  const raw = entry.category === 'cardio' ? set.duration : entry.bodyweight ? set.reps : set.weight
  const n = Number(raw)
  return raw !== '' && raw != null && isFinite(n) && n > 0 ? n : null
}

// Best working set: biggest main number, then the bigger second number.
function bestSet(entry) {
  const sets = workingSets(entry.sets).filter((s) => (entry.timed || entry.bodyweight ? num(s.reps) > 0 : num(s.weight) > 0 || num(s.reps) > 0))
  if (sets.length === 0) return null
  const [main, second] = entry.bodyweight || entry.timed ? ['reps', 'weight'] : ['weight', 'reps']
  return sets.reduce((best, s) => {
    const dm = num(s[main]) - num(best[main])
    if (dm !== 0) return dm > 0 ? s : best
    return num(s[second]) > num(best[second]) ? s : best
  })
}

// Pieces are returned plain; the card isolates them left-to-right so Hebrew
// labels can't reorder the numbers.
export function bestSetText(entry, set, bwLabel) {
  if (entry.timed) {
    const added = num(set.weight) > 0 ? `+${set.weight}${entry.unit} · ` : ''
    return `${added}${formatSeconds(set.reps) || '0s'}`
  }
  if (entry.bodyweight) {
    const added = num(set.weight) > 0 ? `+${set.weight}${entry.unit} ` : ''
    return `${added}${bwLabel} × ${num(set.reps)}`
  }
  return `${num(set.weight)}${entry.unit} × ${num(set.reps)}`
}

export function buildSummary({ entries, personalBests = {}, routineName, date, durationMinutes, minLabel, bwLabel }) {
  let volume = 0
  let volumeUnit = null
  let mixedVolumeUnits = false
  let setCount = 0
  let prCount = 0
  let cardioMinutes = 0
  let cardioDistance = 0
  let cardioUnit = null
  const rows = []

  for (const e of entries || []) {
    const sets = workingSets(e.sets)
    if (e.category === 'cardio') {
      const c = cardioSummary(sets)
      if (!c) continue
      const u = e.unit === 'mi' ? 'mi' : 'km'
      const parts = [`${formatDistance(c.minutes)} ${minLabel}`]
      if (c.distance != null) {
        parts.push(`${formatDistance(c.distance)} ${u}`, `${formatPace(c.pace)} /${u}`)
        cardioDistance += c.distance
        cardioUnit = cardioUnit && cardioUnit !== u ? 'mixed' : u
      }
      cardioMinutes += c.minutes
      const best = e.exerciseId ? personalBests[e.exerciseId] : null
      const pr = best != null && sets.some((s) => (prValue(e, s) || 0) > best)
      if (pr) prCount += 1
      // each piece isolated left-to-right so a Hebrew unit can't reorder the numbers
      rows.push({ name: e.name, text: parts.map((p) => `\u2066${p}\u2069`).join(' · '), pr })
      setCount += sets.filter((s) => num(s.duration) > 0).length
      continue
    }

    const best = bestSet(e)
    if (!best) continue
    setCount += sets.filter((s) => num(s.weight) > 0 || num(s.reps) > 0).length
    if (!e.timed) {
      const v = sets.reduce((sum, s) => sum + num(s.weight) * num(s.reps), 0)
      if (v > 0) {
        volume += v
        if (volumeUnit && volumeUnit !== e.unit) mixedVolumeUnits = true
        volumeUnit = volumeUnit || e.unit
      }
    }
    const prev = e.exerciseId ? personalBests[e.exerciseId] : null
    const pr = prev != null && sets.some((s) => (prValue(e, s) || 0) > prev)
    if (pr) prCount += 1
    rows.push({ name: e.name, text: bestSetText(e, best, bwLabel), pr })
  }

  return {
    routineName,
    date,
    durationMinutes: durationMinutes || null,
    rows,
    prCount,
    setCount,
    // Kilos and pounds can't be added together, so a mixed workout shows no volume.
    volume: mixedVolumeUnits ? 0 : Math.round(volume),
    volumeUnit: volumeUnit || 'kg',
    cardioMinutes: Math.round(cardioMinutes),
    cardioDistance: cardioDistance > 0 && cardioUnit !== 'mixed' ? cardioDistance : null,
    cardioUnit: cardioUnit === 'mixed' ? null : cardioUnit,
  }
}
