import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Play, Pencil, CalendarDays, Check } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, setScheduleDay } from '../lib/db.js'
import { Card, Button, Field } from './ui.jsx'
import { toLocalISODate } from '../lib/dates.js'
import { InfoTip } from './InfoTip.jsx'
import { useScrollLock } from '../lib/scrollLock.js'

// 0 = Sunday ... 6 = Saturday — matches JS's native Date.getDay() and the
// weekly_schedule table's day_of_week column directly.
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const SLOTS = [0, 1, 2]
const SLOT_LABEL_KEYS = ['slotMobility', 'slotStrength', 'slotCardio']

export default function WeeklySchedule({ effectiveUid, routines, routinesLoading = false, sessions = [] }) {
  const { t } = useLanguage()
  const { toast, confirm } = useFeedback()
  const navigate = useNavigate()
  const [schedule, scheduleLoading, refreshSchedule] = useCollection(effectiveUid, 'weekly_schedule', 'day_of_week', 'asc')

  // One panel for a day, in one of two modes. Tapping a day always opens
  // it — nothing starts a workout on its own — and starting is an explicit
  // button inside.
  const [openDay, setOpenDay] = useState(null)
  const [mode, setMode] = useState('view')
  // Unsaved edits, per day. Switching days in "Edit week" used to reload
  // the next day's slots over the top of your changes, so editing Monday,
  // then tapping Tuesday, silently threw Monday away. Now every day you
  // touch keeps its edits until Save (which saves them all) or Cancel.
  const [pending, setPending] = useState({})
  // What was just saved, shown straight away while the fresh copy of the
  // plan loads — otherwise the old routines flashed back for a moment
  // after tapping Save.
  const [justSaved, setJustSaved] = useState({})
  useEffect(() => setJustSaved({}), [schedule])
  const [showOther, setShowOther] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().getDay()
  // Until the plan and routines arrive, every day would read "Rest day" and
  // then flip — show a quiet placeholder instead. Only before the first load
  // finishes: a later refresh (after Save) keeps showing the current plan.
  const loadedFor = useRef(null)
  if (!scheduleLoading && !routinesLoading) loadedFor.current = effectiveUid
  const planLoading = loadedFor.current !== effectiveUid

  // The plan and the log stay separate — a plan isn't a claim about what
  // happened — but showing nothing at all meant a day you'd already
  // trained still read "Rest day". So the plan is what it was, with a tick
  // for what was actually logged this week.
  const weekDates = (() => {
    const base = new Date()
    base.setDate(base.getDate() - base.getDay()) // back to Sunday
    return DAYS.map((dow) => {
      const d = new Date(base)
      d.setDate(base.getDate() + dow)
      return toLocalISODate(d)
    })
  })()

  function loggedOnDay(dow) {
    return sessions.filter((s) => s.date === weekDates[dow])
  }
  useScrollLock(openDay != null)

  // Every routine actually assigned to a day, across all 3 slots, in
  // slot order — filters out empty slots entirely, so an empty slot 1
  // with something in slot 2 doesn't show as a confusing gap.
  function routinesForDay(dow) {
    return savedSlots(dow)
      .map((id) => (id ? routines.find((r) => r.id === id) || null : null))
      .filter(Boolean)
  }

  function savedSlots(dow) {
    if (justSaved[dow]) return justSaved[dow]
    return SLOTS.map((slot) => schedule.find((s) => s.day_of_week === dow && s.slot === slot)?.routine_id || '')
  }
  const pickIds = openDay == null ? ['', '', ''] : pending[openDay] || savedSlots(openDay)
  const dirtyDays = Object.keys(pending)
    .map(Number)
    .filter((dow) => pending[dow].some((id, slot) => id !== savedSlots(dow)[slot]))

  function setPick(slot, id) {
    setPending((prev) => ({ ...prev, [openDay]: pickIds.map((v, i) => (i === slot ? id : v)) }))
  }

  function openDayPanel(dow, startMode = 'view') {
    setPending({})
    setShowOther(false)
    setMode(startMode)
    setOpenDay(dow)
  }

  function switchDay(dow) {
    setShowOther(false)
    setOpenDay(dow)
  }

  function close() {
    setOpenDay(null)
    setShowOther(false)
    setMode('view')
    setPending({})
  }

  // Tapping outside closes the panel, but never on top of unsaved edits —
  // that's what Cancel is for.
  function backdropClose() {
    if (mode === 'edit' && dirtyDays.length > 0) return
    close()
  }

  async function saveDay() {
    setSaving(true)
    try {
      for (const dow of dirtyDays) {
        for (const slot of SLOTS) {
          await setScheduleDay(effectiveUid, dow, slot, pending[dow][slot] || null)
        }
      }
      setJustSaved((prev) => ({ ...prev, ...Object.fromEntries(dirtyDays.map((d) => [d, pending[d]])) }))
      setPending({})
      refreshSchedule()
      toast(t('feedback.saved'))
      setMode('view')
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function startRoutine(id) {
    close()
    navigate(`/workout/${id}`)
  }

  // Another day's workout can be started too, after a quick heads-up that
  // it will be logged as today's session (the plan itself is untouched).
  async function startOtherDay(r, dow) {
    const day = t(`dashboard.day${dow}`)
    const ok = await confirm({
      title: t('dashboard.otherDayTitle', { day }),
      body: t('dashboard.otherDayBody', { day, name: r.name }),
      confirmLabel: t('dashboard.otherDayConfirm'),
    })
    if (ok) startRoutine(r.id)
  }

  const dayRoutines = openDay == null ? [] : routinesForDay(openDay)
  const isTodayOpen = openDay === today

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="eyebrow inline-flex items-center gap-1">
          {t('dashboard.weeklySchedule')} <InfoTip text={t('dashboard.weeklyScheduleTip')} />
        </h2>
        <button
          type="button"
          onClick={() => openDayPanel(today, 'edit')}
          className="hit text-chalkdim text-xs hover:text-brass inline-flex items-center gap-1"
        >
          <Pencil size={12} /> {t('dashboard.editWeek')}
        </button>
      </div>

      {DAYS.map((dow) => {
        const dr = routinesForDay(dow)
        const isToday = dow === today
        return (
          <button
            key={dow}
            type="button"
            onClick={() => openDayPanel(dow)}
            className={`press-row flex items-center justify-between gap-2 rounded-md px-3 py-2.5 min-h-[44px] text-start transition-colors ${
              isToday ? 'bg-ironsoft border border-iron/40' : 'hover:bg-surface2 border border-transparent'
            }`}
          >
            <span className={`text-sm inline-flex items-center gap-1.5 shrink-0 ${isToday ? 'text-chalk' : 'text-chalkdim'}`}>
              {t(`dashboard.day${dow}`)}
              {isToday && <span className="eyebrow text-irontext">{t('dashboard.today')}</span>}
            </span>
            <span className="flex items-center gap-1.5 min-w-0 max-w-[60%]">
              {loggedOnDay(dow).length > 0 && <Check size={14} className="text-good shrink-0" />}
              {planLoading ? (
                <span className="h-3 w-24 rounded bg-surface2 animate-pulse" aria-hidden="true" />
              ) : (
                <span className={`text-sm truncate ${dr.length > 0 ? 'text-chalk' : 'text-chalkdim italic'}`}>
                  {dr.length > 0 ? dr.map((r) => r.name).join(' + ') : t('dashboard.restDay')}
                </span>
              )}
            </span>
          </button>
        )
      })}

      {/* Rendered at the top level of the page so nothing it sits inside
          (a card, a pressed row) can shift or clip the panel. */}
      {openDay != null && createPortal(
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center p-4" onClick={backdropClose}>
          <div className="card p-6 w-full max-w-sm max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-xl inline-flex items-center gap-2">
                {t(`dashboard.day${openDay}`)}
                {isTodayOpen && <span className="eyebrow text-irontext">{t('dashboard.today')}</span>}
              </h2>
              {mode === 'view' && (
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="hit text-chalkdim text-xs hover:text-brass inline-flex items-center gap-1 shrink-0"
                >
                  <Pencil size={12} /> {t('dashboard.editDay')}
                </button>
              )}
            </div>

            {mode === 'view' ? (
              <>
                {dayRoutines.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {dayRoutines.map((r) => (
                      <Button
                        key={r.id}
                        type="button"
                        variant={isTodayOpen ? undefined : 'subtle'}
                        onClick={() => (isTodayOpen ? startRoutine(r.id) : startOtherDay(r, openDay))}
                        className="justify-between min-h-[44px]"
                      >
                        <span className="truncate">{r.name}</span>
                        <Play size={15} className="shrink-0" />
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-chalkdim text-sm">{isTodayOpen ? t('dashboard.restDayToday') : t('dashboard.restDayPlanned')}</p>
                )}

                {loggedOnDay(openDay).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-line flex flex-col gap-1.5">
                    <p className="eyebrow text-good">{t('dashboard.alreadyLogged')}</p>
                    {loggedOnDay(openDay).map((s) => (
                      <Link
                        key={s.id}
                        to={`/history/${s.id}`}
                        onClick={close}
                        className="text-sm text-chalk hover:text-brass truncate inline-flex items-center gap-1.5"
                      >
                        <Check size={14} className="text-good shrink-0" />
                        {s.routine_name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Life happens — a meeting moves leg day to Thursday. You
                    can train anything today without touching the plan,
                    which stays as it is for next week. */}
                {isTodayOpen && (
                  <div className="mt-4 pt-4 border-t border-line">
                    {showOther ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-chalkdim text-xs">{t('dashboard.startAnythingHint')}</p>
                        {routines.length === 0 && <p className="text-chalkdim text-sm">{t('dashboard.noRoutinesYet')}</p>}
                        {routines.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => startRoutine(r.id)}
                            className="press-row w-full text-start rounded-md bg-surface2 hover:bg-line px-3 py-2.5 text-sm flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{r.name}</span>
                            <Play size={14} className="shrink-0 text-brass" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowOther(true)}
                        className="text-brass text-sm hover:underline inline-flex items-center gap-1"
                      >
                        <CalendarDays size={14} />
                        {dayRoutines.length > 0 ? t('dashboard.startSomethingElse') : t('dashboard.trainAnyway')}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex justify-end mt-5">
                  <Button type="button" variant="ghost" onClick={close}>
                    {t('common.close')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Day switcher so the whole week can be set up without
                    closing and reopening seven times. */}
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {DAYS.map((dow) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => switchDay(dow)}
                      className={`press min-h-11 rounded text-xs ${
                        dow === openDay ? 'bg-brass text-ink' : 'bg-surface2 text-chalkdim hover:text-chalk'
                      }`}
                    >
                      {t(`dashboard.dayShort${dow}`)}
                      {dirtyDays.includes(dow) && <span className="ms-0.5">•</span>}
                    </button>
                  ))}
                </div>

                <p className="text-chalkdim text-xs mb-3">{t('dashboard.upToThree')}</p>
                <div className="flex flex-col gap-3">
                  {SLOTS.map((slot) => (
                    <Field key={slot} label={t(`dashboard.${SLOT_LABEL_KEYS[slot]}`)}>
                      <select
                        value={pickIds[slot]}
                        onChange={(e) => setPick(slot, e.target.value)}
                        className="w-full"
                      >
                        <option value="">{t('dashboard.slotEmpty')}</option>
                        {routines.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <Button type="button" variant="ghost" onClick={close}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="button" onClick={saveDay} disabled={saving || dirtyDays.length === 0}>
                    {t('common.save')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </Card>
  )
}
