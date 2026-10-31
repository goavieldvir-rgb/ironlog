import React, { useEffect, useRef, useState } from 'react'
import { Bell, Share, SquarePlus, Smartphone, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Card, Button } from './ui.jsx'
import { DEFAULT_REMIND_TIME, ALL_DAYS, remindDaysSupported, pushStatus, getMyReminder, getTrainingDays, enableReminder, updateReminder, disableReminder, sendTestNotification, isIOS } from '../lib/push.js'

export default function Notifications() {
  const { user } = useAuth()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  // Bumped after a permission prompt so pushStatus() is read again and a
  // denied answer shows the blocked card right away.
  const [, setStatusTick] = useState(0)
  const status = pushStatus()
  const [on, setOn] = useState(false)
  const [time, setTime] = useState(DEFAULT_REMIND_TIME)
  const [days, setDays] = useState(ALL_DAYS)
  // Turns false once a save shows the remind_days column isn't there yet.
  const [daysOk, setDaysOk] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(status !== 'ready')
  const [loadError, setLoadError] = useState(false)
  const saveTimer = useRef(null)
  // { time, days } waiting on the debounce, or null.
  const pending = useRef(null)
  // Week starts on Sunday (getDay order); names come from Intl in the UI language.
  // Hebrew short names are "יום א׳" but "שבת", so the "יום " prefix goes to fit the chip.
  const dayNames = ALL_DAYS.map((d) => {
    const at = new Date(Date.UTC(2023, 0, 1 + d))
    const f = (weekday) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { weekday, timeZone: 'UTC' }).format(at)
    return { short: f('short').replace(/^יום\s*/, ''), long: f('long') }
  })

  function load() {
    if (pushStatus() !== 'ready') { setLoaded(true); return }
    setLoaded(false)
    setLoadError(false)
    getMyReminder(user.uid)
      .then((r) => {
        if (r) {
          setOn(true)
          setTime(String(r.remind_time).slice(0, 5))
          if (Array.isArray(r.remind_days) && r.remind_days.length) setDays(r.remind_days.map(Number).sort())
        }
        setDaysOk(remindDaysSupported())
      })
      .catch((e) => { console.error(e); setLoadError(true) })
      .finally(() => setLoaded(true))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Read at unmount, so the save uses the current language, not the first render's.
  const latest = useRef({})
  latest.current = { uid: user.uid, lang }
  // Save a pending time or days change if the page is left before the debounce fires.
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    const p = pending.current
    if (p) updateReminder(latest.current.uid, p.time, latest.current.lang, p.days).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle() {
    clearTimeout(saveTimer.current)
    pending.current = null
    setBusy(true)
    try {
      if (on) {
        await disableReminder(user.uid)
        setOn(false)
        toast(t('notifications.turnedOff'))
      } else {
        await enableReminder(user.uid, time, lang, days)
        setOn(true)
        setDaysOk(remindDaysSupported())
        toast(t('notifications.turnedOn'))
      }
    } catch (e) {
      console.error(e)
      toast(e.message === 'denied' ? t('notifications.denied') : e.message === 'unsupported-service' ? t('notifications.unsupported') : t('notifications.failed'), 'error')
    } finally {
      setBusy(false)
      setStatusTick((n) => n + 1)
    }
  }

  async function sendTest() {
    setBusy(true)
    try {
      const r = await sendTestNotification()
      toast(t(r === 'sent' ? 'notifications.testSent' : r === 'too-soon' ? 'notifications.testWait' : 'notifications.failed'), r === 'sent' ? undefined : 'error')
    } finally {
      setBusy(false)
    }
  }

  // The time picker fires onChange on every wheel tick, so the save waits for
  // the person to stop (800ms) or leave the field, and toasts once. Day taps
  // go through the same debounce.
  async function commit(v, d) {
    clearTimeout(saveTimer.current)
    pending.current = null
    if (!on || !v) return
    try {
      await updateReminder(user.uid, v, lang, d)
      setDaysOk(remindDaysSupported())
      toast(t('notifications.saved'))
    } catch (e) {
      console.error(e)
      toast(t('notifications.failed'), 'error')
    }
  }

  function schedule(v, d) {
    clearTimeout(saveTimer.current)
    if (!on || !v) { pending.current = null; return }
    pending.current = { time: v, days: d }
    saveTimer.current = setTimeout(() => commit(v, d), 800)
  }

  function changeTime(v) {
    setTime(v)
    schedule(v, days)
  }

  function changeDays(d) {
    setDays(d)
    schedule(time, d)
  }

  function toggleDay(d) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    // At least one day stays on.
    if (next.length) changeDays(next)
  }

  async function pickTrainingDays() {
    try {
      const d = await getTrainingDays(user.uid)
      if (!d.length) { toast(t('notifications.noTrainingDays')); return }
      changeDays(d)
    } catch (e) {
      console.error(e)
      toast(t('notifications.failed'), 'error')
    }
  }

  const sameDays = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1 flex items-center gap-1.5"><Bell size={13} /> {t('notifications.eyebrow')}</div>
        <h1 className="text-3xl">{t('notifications.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">{t('notifications.subtitle')}</p>
      </div>

      {status === 'needs-install' && (
        <Card>
          <div className="flex items-center gap-2 font-medium mb-1"><Smartphone size={18} /> {t('notifications.installTitle')}</div>
          <p className="text-chalkdim text-sm mb-3">{t('notifications.installBody')}</p>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="num w-6 h-6 shrink-0 rounded-full bg-surface2 flex items-center justify-center text-xs">1</span>
              <span className="flex-1">{t('notifications.step1')} <Share size={15} className="inline align-text-bottom" /></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="num w-6 h-6 shrink-0 rounded-full bg-surface2 flex items-center justify-center text-xs">2</span>
              <span className="flex-1">{t('notifications.step2')} <SquarePlus size={15} className="inline align-text-bottom" /></span>
            </li>
          </ol>
          <p className="text-chalkdim text-xs mt-3">{t('notifications.installAfter')}</p>
        </Card>
      )}

      {status === 'unsupported' && (
        <Card><p className="text-sm text-chalkdim">{isIOS() ? t('notifications.unsupportedIos') : t('notifications.unsupported')}</p></Card>
      )}

      {status === 'denied' && (
        <Card><p className="text-sm text-chalkdim">{t('notifications.blocked')}</p></Card>
      )}

      {status === 'ready' && loadError && (
        <Card className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-chalk">{t('notifications.loadFailed')}</p>
          <Button variant="brass" onClick={load}>{t('common.tryAgain')}</Button>
        </Card>
      )}

      {status === 'ready' && !loadError && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{t('notifications.toggleLabel')}</div>
              <div className="text-chalkdim text-sm">{t('notifications.toggleHint')}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={t('notifications.toggleLabel')}
              disabled={busy || !loaded}
              onClick={toggle}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ironbtn' : 'bg-surface2'}`}
            >
              <span className={`absolute top-0.5 start-0.5 w-6 h-6 rounded-full bg-chalk transition-transform ${on ? 'ltr:translate-x-5 rtl:-translate-x-5' : ''}`} />
            </button>
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span>
              <span className="block font-medium">{t('notifications.timeLabel')}</span>
              <span className="block text-chalkdim text-sm">{t('notifications.timeHint')}</span>
            </span>
            <input
              type="time"
              dir="ltr"
              value={time}
              onChange={(e) => changeTime(e.target.value)}
              onBlur={(e) => { if (pending.current) commit(e.target.value, pending.current.days) }}
              className="num bg-surface2 rounded-md px-3 min-h-[44px] text-chalk"
            />
          </label>
          {daysOk && (
            <div className="border-t border-line pt-4">
              <div className="font-medium">{t('notifications.daysLabel')}</div>
              <div className="text-chalkdim text-sm mb-3">{t('notifications.daysHint')}</div>
              <div role="group" aria-label={t('notifications.daysLabel')} className="grid grid-cols-7 gap-0.5 -mx-1">
                {dayNames.map((n, d) => {
                  const pressed = days.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={pressed}
                      aria-label={n.long}
                      onClick={() => toggleDay(d)}
                      className={`min-h-[44px] rounded-md text-sm font-medium transition-colors ${pressed ? 'bg-ironbtn text-chalk' : 'bg-surface2 text-chalkdim'}`}
                    >
                      {n.short}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="ghost" className={sameDays(days, ALL_DAYS) ? 'ring-2 ring-accent' : ''} aria-pressed={sameDays(days, ALL_DAYS)} onClick={() => changeDays(ALL_DAYS)}>{t('notifications.everyDay')}</Button>
                <Button variant="ghost" onClick={pickTrainingDays}>{t('notifications.trainingDays')}</Button>
              </div>
            </div>
          )}
          {on && (
            <div className="border-t border-line pt-4">
              <Button variant="ghost" onClick={sendTest} disabled={busy}>
                <Send size={16} /> {t('notifications.testButton')}
              </Button>
            </div>
          )}
        </Card>
      )}

      <p className="text-chalkdim text-xs">{t('notifications.timerNote')}</p>
    </div>
  )
}
