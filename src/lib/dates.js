// Formats a Date as YYYY-MM-DD using its LOCAL calendar date — deliberately
// NOT date.toISOString().slice(0, 10), which converts to UTC first. For
// anyone in a timezone ahead of UTC (Israel included), that conversion can
// silently shift the reported date backward by a day — especially right
// after local midnight, or whenever a Date has already been "walked" to a
// specific day via setDate() and then re-stringified. That mismatch was
// causing real logged sessions to land in the wrong week bucket on the
// Stats page (or fall outside the visible window entirely), even though
// the sessions themselves were saved correctly.
export function toLocalISODate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Locale used for displaying dates and numbers, following the app language
// rather than the phone locale (so a Hebrew UI never shows English month
// names just because the phone is set to English). Same choice as WorkoutDone.
export function dateLocale(lang) {
  return lang === 'he' ? 'he-IL' : 'en-US'
}

export function fmtDate(lang, date, opts) {
  return date.toLocaleDateString(dateLocale(lang), opts)
}

// Weeks start on Sunday (the app is used in Israel). Every weekly bucket
// (Stats, streak, weekly summary, People, nutrition averages) uses this.
export function weekStartDate(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

export function weekStartOf(dateISO) {
  return toLocalISODate(weekStartDate(new Date(dateISO + 'T00:00:00')))
}
