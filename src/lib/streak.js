import { toLocalISODate } from './dates.js'

// Same week boundaries as the Stats page: weeks start on Monday.
function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00')
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return toLocalISODate(d)
}

// Weeks in a row, ending with the week of the workout just saved, that have
// at least one workout. Counting back from that workout's own week (not
// "today") means a Sunday workout saved after midnight, or a backdated one,
// still gets its streak. `justSaved` is that workout's date; it isn't in
// `sessions` yet.
export function weeklyStreak(sessions, justSaved) {
  const weeks = new Set((sessions || []).map((s) => mondayOf(s.date)))
  weeks.add(mondayOf(justSaved))
  let count = 0
  const d = new Date(mondayOf(justSaved) + 'T00:00:00')
  while (weeks.has(toLocalISODate(d))) {
    count += 1
    d.setDate(d.getDate() - 7)
  }
  return count
}
