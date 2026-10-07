import { toLocalISODate } from './dates.js'

// Same week boundaries as the Stats page: weeks start on Monday.
function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00')
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return toLocalISODate(d)
}

// Weeks in a row, ending with this week, that have at least one workout.
// Matches the "week streak" tile on Stats; `justSaved` is the date of the
// workout being saved right now, which isn't in `sessions` yet.
export function weeklyStreak(sessions, justSaved, today = toLocalISODate()) {
  const weeks = new Set((sessions || []).map((s) => mondayOf(s.date)))
  if (justSaved) weeks.add(mondayOf(justSaved))
  let count = 0
  const d = new Date(mondayOf(today) + 'T00:00:00')
  while (weeks.has(toLocalISODate(d))) {
    count += 1
    d.setDate(d.getDate() - 7)
  }
  return count
}
