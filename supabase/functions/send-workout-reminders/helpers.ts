// Pure helpers (no database, no network) so they can be tested on their own.

// A reminder goes out between its set time and WINDOW_MIN minutes later, but
// never past local midnight, so a 23:00 reminder can't fire at 00:15 as
// the next day's.
export const WINDOW_MIN = 180

// One instant, formatted once in the subscriber's own time zone. Date and
// time come from the same formatted result, so they can't disagree around
// midnight. The weekday is worked out from the date itself (0 = Sunday, the
// same numbering as weekly_schedule.day_of_week and JS getDay), never from
// a localized weekday name.
export function localParts(tz: string, at = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  const dow = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay()
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow }
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export function isDue(remindTime: string, minutesNow: number) {
  const start = toMinutes(remindTime)
  return minutesNow >= start && minutesNow < Math.min(start + WINDOW_MIN, 24 * 60)
}

// Only the browsers' own push services. Anything else is never contacted,
// so nobody can make the function call an arbitrary address.
export function isAllowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false
    const h = u.hostname
    return (
      h === 'fcm.googleapis.com' ||
      h === 'updates.push.services.mozilla.com' ||
      h === 'web.push.apple.com' ||
      h.endsWith('.notify.windows.com')
    )
  } catch {
    return false
  }
}

// What to send on a given day: the workout reminder, a rest day note, or
// nothing. Someone with nothing scheduled all week hasn't set up a plan, so
// they get nothing rather than a rest day message every day. Already having
// trained as planned (or trained on a rest day) also means no nudge.
export function reminderKind(plannedToday: number, plannedThisWeek: number, loggedToday: number): 'workout' | 'rest' | null {
  if (plannedThisWeek === 0) return null
  if (plannedToday > 0) return loggedToday >= plannedToday ? null : 'workout'
  return loggedToday > 0 ? null : 'rest'
}
