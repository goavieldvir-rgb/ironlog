// Cardio sets record minutes, effort (RPE or HR zone) and an optional
// distance in the exercise's own unit (km or mi). These helpers turn a list
// of sets into the numbers people actually read: totals, speed and pace.

export const KM_PER_MI = 1.609344

const num = (v) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

// Totals for one exercise in one workout. Speed and pace only use the sets
// that have both a time and a distance, so an interval logged without
// distance doesn't drag the average down.
export function cardioSummary(sets) {
  let minutes = 0
  let distance = 0
  let distMinutes = 0
  let intensitySum = 0
  let intensityN = 0
  let longest = 0
  let any = false
  for (const s of sets || []) {
    const d = num(s.duration)
    if (d == null || d <= 0) continue
    any = true
    minutes += d
    if (d > longest) longest = d
    const dist = num(s.distance)
    if (dist != null && dist > 0) {
      distance += dist
      distMinutes += d
    }
    const i = num(s.intensity)
    if (i != null && i > 0) {
      intensitySum += i
      intensityN += 1
    }
  }
  if (!any) return null
  const hasDistance = distance > 0 && distMinutes > 0
  return {
    minutes,
    longest,
    distance: hasDistance ? distance : null,
    speed: hasDistance ? distance / (distMinutes / 60) : null, // unit per hour
    pace: hasDistance ? distMinutes / distance : null, // minutes per unit
    intensity: intensityN > 0 ? intensitySum / intensityN : null,
  }
}

// 5.5 -> "5:30"
export function formatPace(minPerUnit) {
  const n = Number(minPerUnit)
  if (!isFinite(n) || n <= 0) return ''
  let m = Math.floor(n)
  let s = Math.round((n - m) * 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export const formatSpeed = (v) => (isFinite(Number(v)) && Number(v) > 0 ? (Math.round(Number(v) * 10) / 10).toString() : '')
export const formatDistance = (v) => (Math.round(Number(v) * 100) / 100).toString()
export const toKm = (distance, unit) => (unit === 'mi' ? distance * KM_PER_MI : distance)

// ["40 min", "5 km", "6:00 /km", "10 km/h"] — the whole exercise at a glance.
export function cardioTotalParts(summary, unit, minLabel) {
  if (!summary) return []
  const u = unit === 'mi' ? 'mi' : 'km'
  const parts = [`${formatDistance(summary.minutes)} ${minLabel}`]
  if (summary.distance != null) {
    parts.push(`${formatDistance(summary.distance)} ${u}`)
    parts.push(`${formatPace(summary.pace)} /${u}`)
    parts.push(`${formatSpeed(summary.speed)} ${u === 'mi' ? 'mph' : 'km/h'}`)
  }
  return parts
}
