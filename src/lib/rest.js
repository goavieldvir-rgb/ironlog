// Per-exercise rest. A routine item can carry its own `restSeconds`, and an
// exercise can carry a default (`rest_seconds` in Supabase). Neither set means
// the rest timer keeps using whatever length was picked last.

export const REST_MIN = 5
export const REST_MAX = 3600
export const REST_CHOICES = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300]

// A whole number of seconds in range, or null for "not set".
export function cleanRest(v) {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < REST_MIN) return null
  return Math.min(REST_MAX, n)
}

// The rest for one exercise in a workout: the routine's own value wins over
// the exercise's default.
export function restFor(item, exercise) {
  return cleanRest(item?.restSeconds) ?? cleanRest(exercise?.rest_seconds)
}

// "1:30", "2:00", "45s". Always left to right.
export function formatRest(s) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
