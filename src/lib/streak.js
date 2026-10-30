import { toLocalISODate, weekStartOf } from './dates.js'

// Same week boundaries as the Stats page: weeks start on Sunday.

// Weeks in a row, ending with the week of the workout just saved, that have
// at least one workout. Counting back from that workout's own week (not
// "today") means a Sunday workout saved after midnight, or a backdated one,
// still gets its streak. `justSaved` is that workout's date; it isn't in
// `sessions` yet.
export function weeklyStreak(sessions, justSaved) {
  // An empty or unreadable date must not reach the loop below (an invalid
  // date never leaves the set, so it would spin forever).
  if (!justSaved || Number.isNaN(new Date(justSaved + 'T00:00:00').getTime())) return 0
  const weeks = new Set((sessions || []).map((s) => weekStartOf(s.date)))
  weeks.add(weekStartOf(justSaved))
  let count = 0
  const d = new Date(weekStartOf(justSaved) + 'T00:00:00')
  while (count < 520 && weeks.has(toLocalISODate(d))) {
    count += 1
    d.setDate(d.getDate() - 7)
  }
  return count
}

// The streak as of today: the current week doesn't break it until it's over,
// so on a Sunday before the first workout it still counts last week's run.
// Stats and the saved-workout screen both count with weeklyStreak above.
export function currentStreak(sessions, today = toLocalISODate()) {
  const weeks = new Set((sessions || []).map((s) => weekStartOf(s.date)))
  const thisWeek = weekStartOf(today)
  if (weeks.has(thisWeek)) return weeklyStreak(sessions, today)
  const d = new Date(thisWeek + 'T00:00:00')
  d.setDate(d.getDate() - 7)
  const lastWeek = toLocalISODate(d)
  return weeks.has(lastWeek) ? weeklyStreak(sessions, lastWeek) : 0
}
