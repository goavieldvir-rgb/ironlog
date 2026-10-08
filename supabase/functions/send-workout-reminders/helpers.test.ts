// Run with: deno test supabase/functions/send-workout-reminders/helpers.test.ts
import { isAllowedEndpoint, isDue, localParts, reminderKind } from './helpers.ts'

const assert = (c: boolean, m: string) => { if (!c) throw new Error('FAIL ' + m) }

Deno.test('local date, weekday and time', () => {
  // 2026-10-08 is a Thursday; 20:30 UTC is 23:30 in Jerusalem (UTC+3)
  const a = localParts('Asia/Jerusalem', new Date('2026-10-08T20:30:00Z'))
  assert(a.date === '2026-10-08' && a.dow === 4 && a.minutes === 23 * 60 + 30, 'Thursday 23:30')
  const b = localParts('Asia/Jerusalem', new Date('2026-10-08T21:15:00Z'))
  assert(b.date === '2026-10-09' && b.dow === 5 && b.minutes === 15, 'Friday 00:15')
  assert(localParts('Asia/Jerusalem', new Date('2026-10-11T06:00:00Z')).dow === 0, 'Sunday is 0')
  assert(localParts('UTC', new Date('2026-10-10T12:00:00Z')).dow === 6, 'Saturday is 6')
  assert(localParts('Pacific/Auckland', new Date('2026-10-08T20:30:00Z')).dow === 5, 'Auckland is already Friday')
})

Deno.test('reminder window never wraps past midnight', () => {
  assert(isDue('23:00', 23 * 60 + 30), '23:30 is inside the 23:00 window')
  assert(!isDue('23:00', 15), '00:15 is not')
  assert(!isDue('08:00', 7 * 60 + 59) && isDue('08:00', 8 * 60) && !isDue('08:00', 11 * 60), '08:00 window')
})

Deno.test('only real push services are contacted', () => {
  assert(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc'), 'fcm')
  assert(isAllowedEndpoint('https://web.push.apple.com/QXYZ'), 'apple')
  assert(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), 'mozilla')
  assert(isAllowedEndpoint('https://par02p.notify.windows.com/w/?token=x'), 'windows')
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.com/x', 'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/.notify.windows.com/', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
    'https://notify.windows.com.evil.com/', 'https://127.0.0.1/x', 'not a url'])
    assert(!isAllowedEndpoint(bad), 'rejects ' + bad)
})

Deno.test('workout, rest day or nothing', () => {
  assert(reminderKind(1, 4, 0) === 'workout', 'planned and not done yet')
  assert(reminderKind(2, 4, 1) === 'workout', 'one of two done')
  assert(reminderKind(1, 4, 1) === null, 'planned work already logged')
  assert(reminderKind(0, 4, 0) === 'rest', 'rest day')
  assert(reminderKind(0, 4, 1) === null, 'trained on a rest day: no rest note')
  assert(reminderKind(0, 0, 0) === null, 'no plan at all: nothing')
})
