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

// The "your coach left feedback" push. The note itself is the body, cut to
// what a lock screen shows.
export function feedbackCopy(lang: string, routineName: string | null, comment: string) {
  const he = lang === 'he'
  const text = comment.trim().replace(/\s+/g, ' ')
  const body = text.length > 140 ? text.slice(0, 139) + '…' : text
  const name = routineName?.trim()
  return he
    ? { title: name ? `משוב מהמאמן על ${name}` : 'משוב מהמאמן', body }
    : { title: name ? `Coach feedback on ${name}` : 'Feedback from your coach', body }
}

// The coach's morning "needs attention" push: a count in the title, then one
// short line per task, as many as fit a lock screen.
export type CoachTask = { kind: string; name: string; n: number | null; title: string | null }

export function coachTaskLine(lang: string, t: CoachTask) {
  const he = lang === 'he'
  switch (t.kind) {
    case 'quiet': return he ? `${t.name} לא התאמן/ה ${t.n} ימים` : `${t.name}: no workout in ${t.n} days`
    case 'food': return he ? `${t.name} לא רשם/ה אוכל${t.n ? ` ${t.n} ימים` : ''}` : `${t.name}: no food logged${t.n ? ` in ${t.n} days` : ''}`
    case 'birthday': return he ? `🎂 יום הולדת ל${t.name}${t.n ? ` (${t.n})` : ''}` : `🎂 ${t.name}'s birthday${t.n ? ` (${t.n})` : ''}`
    case 'checkin': return he ? `צ׳ק-אין עם ${t.name}` : `Check-in with ${t.name}`
    case 'weigh': return he ? `${t.name} לא נשקל/ה ${t.n} ימים` : `${t.name}: no weigh-in in ${t.n} days`
    case 'welcome': return he ? `לבדוק איך עובר השבוע הראשון של ${t.name}` : `See how ${t.name}'s first week is going`
    default: return t.name ? `${t.title} (${t.name})` : (t.title || '')
  }
}

export function coachTasksCopy(lang: string, tasks: CoachTask[], max = 4) {
  const he = lang === 'he'
  const lines = tasks.slice(0, max).map((t) => coachTaskLine(lang, t))
  const more = tasks.length - lines.length
  if (more > 0) lines.push(he ? `ועוד ${more}` : `and ${more} more`)
  const title = tasks.length === 1
    ? (he ? 'משימה אחת למאמן' : '1 thing needs you')
    : (he ? `${tasks.length} משימות למאמן` : `${tasks.length} things need you`)
  return { title, body: lines.join('\n') }
}
