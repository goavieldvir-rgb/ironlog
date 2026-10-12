import React, { useCallback, useEffect, useState } from 'react'
import { Check, Droplet, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { fmtDate, toLocalISODate } from '../../lib/dates.js'
import { friendlyError, isNotSetUp } from '../../lib/nutrition.js'
import {
  GOAL_MAX,
  GOAL_MIN,
  GOAL_PRESETS,
  MAX_DRINK_ML,
  QUICK_ML,
  addWater,
  deleteWater,
  getWaterGoal,
  getWaterLogs,
  litres,
  saveWaterGoal,
  sumMl,
} from '../../lib/water.js'
import { Button, Card } from '../ui.jsx'
import { N, Sheet, SheetHeader, Stepper, Track } from './parts.jsx'

// Water card for the nutrition diary: the selected day's total against the
// goal, quick adds, and the seven days up to the selected one. Tapping a day
// moves the whole diary to it.

const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

export default function Water({ uid, date, today, onPickDate, onToast }) {
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [rows, setRows] = useState([])
  const [goal, setGoal] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [reloadN, setReloadN] = useState(0)
  const from = shiftDay(date, -6)

  useEffect(() => {
    if (!uid) return
    let off = false
    Promise.all([getWaterLogs(uid, from, date), getWaterGoal(uid)])
      .then(([logs, g]) => {
        if (off) return
        setRows(logs || [])
        setGoal(g)
        setError(null)
        setLoaded(true)
      })
      .catch((err) => {
        if (off) return
        console.error(err)
        setError(err)
        setLoaded(true)
      })
    return () => {
      off = true
    }
  }, [uid, from, date, reloadN])

  const reload = useCallback(() => setReloadN((n) => n + 1), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  async function add(ml) {
    try {
      const row = await addWater(uid, date, ml)
      setRows((r) => [...r, row])
      onToast(t('water.added', { ml }), [row.id], async () => {
        await deleteWater([row.id])
        reload()
      })
      return true
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
      return false
    }
  }

  async function remove(id) {
    if (!(await confirm({ title: t('water.deleteTitle'), body: t('water.deleteBody'), confirmLabel: t('nutrition.delete'), danger: true }))) return
    try {
      await deleteWater([id])
      setRows((r) => r.filter((x) => x.id !== id))
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  async function onSaveGoal(ml) {
    try {
      setGoal(await saveWaterGoal(uid, ml))
      setSheet(null)
      onToast(t('water.goalSaved'))
    } catch (err) {
      console.error(err)
      toast(friendlyError(err, t), 'error')
    }
  }

  if (!loaded) return null
  if (error) {
    // The food diary above already explains a missing setup.
    if (isNotSetUp(error)) return null
    return (
      <Card className="flex items-center justify-between gap-3 !py-3">
        <span className="text-sm text-chalkdim">{t('water.loadFailed')}</span>
        <Button variant="ghost" onClick={reload}>
          {t('water.retry')}
        </Button>
      </Card>
    )
  }

  const dayRows = rows.filter((r) => r.date === date)
  const total = sumMl(dayRows)
  const left = goal != null ? goal - total : null
  const L = t('water.litres')
  const ml = t('water.ml')

  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = shiftDay(date, i - 6)
    return { iso, ml: sumMl(rows.filter((r) => r.date === iso)) }
  })
  const scale = Math.max(goal || 0, ...days.map((d) => d.ml), 1)

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <Droplet size={14} aria-hidden="true" /> {t('water.title')}
          </span>
          <span className="flex items-center gap-1">
            {left != null && (
              <span className="text-chalkdim text-sm whitespace-nowrap">
                {left > 0 ? (
                  <>
                    <N mono className="text-chalk">{litres(left)}</N> {L} {t('nutrition.left')}
                  </>
                ) : (
                  t('water.goalReached')
                )}
              </span>
            )}
            {dayRows.length > 0 && (
              <button type="button" onClick={() => setSheet('entries')} aria-label={t('water.entries')} title={t('water.entries')} className="w-11 h-11 -my-2 inline-flex items-center justify-center rounded-md text-chalkdim hover:text-chalk hover:bg-surface2">
                <ListOrdered size={17} />
              </button>
            )}
            {goal != null && (
              <button type="button" onClick={() => setSheet('goal')} aria-label={t('water.editGoal')} title={t('water.editGoal')} className="w-11 h-11 -my-2 -me-2 inline-flex items-center justify-center rounded-md text-chalkdim hover:text-chalk hover:bg-surface2">
                <Pencil size={16} />
              </button>
            )}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <N mono className="text-3xl leading-none">{litres(total)}</N>
          <span className="text-chalkdim text-sm whitespace-nowrap">
            {goal != null ? (
              <>
                {t('nutrition.of')} <N mono>{litres(goal)}</N> {L}
              </>
            ) : (
              L
            )}
          </span>
          {goal == null && (
            <button type="button" onClick={() => setSheet('goal')} className="ms-auto min-h-[44px] -my-2 px-2 text-sm underline underline-offset-2 text-chalkdim hover:text-chalk">
              {t('water.setGoal')}
            </button>
          )}
        </div>
        {goal > 0 && (
          <div className="mt-3">
            <Track value={total} max={goal} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_ML.map((v) => (
          <button key={v} type="button" onClick={() => add(v)} aria-label={t('water.addMl', { ml: v })} className="min-h-[48px] rounded-md border border-line bg-surface2 hover:border-chalk press text-sm whitespace-nowrap">
            <N mono>+{v}</N> <span className="text-chalkdim text-xs">{ml}</span>
          </button>
        ))}
        <button type="button" onClick={() => setSheet('custom')} className="min-h-[48px] rounded-md border border-line bg-surface2 hover:border-chalk press text-sm inline-flex items-center justify-center gap-1 whitespace-nowrap">
          <Plus size={16} /> {t('water.other')}
        </button>
      </div>

      <div className="border-t border-line pt-3">
        <div className="eyebrow mb-2">{t('water.week')}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const dObj = new Date(d.iso + 'T00:00:00')
            const sel = d.iso === date
            const met = goal > 0 && d.ml >= goal
            const pct = Math.min(100, (d.ml / scale) * 100)
            const label = `${fmtDate(lang, dObj, { weekday: 'long', day: 'numeric', month: 'long' })}: ${litres(d.ml)} ${L}`
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => onPickDate(d.iso)}
                aria-label={label}
                aria-current={sel ? 'date' : undefined}
                className={`flex flex-col items-center gap-1 rounded-md py-1.5 press ${sel ? 'bg-surface2' : 'hover:bg-surface2'}`}
              >
                <span className="relative w-3 h-12 rounded-full bg-surface2 overflow-hidden" aria-hidden="true">
                  <span className={`absolute inset-x-0 bottom-0 rounded-full ${met ? 'bg-brass' : sel ? 'bg-chalk' : 'bg-chalkdim'}`} style={{ height: `${pct}%` }} />
                </span>
                <span className={`text-xs ${sel ? 'text-chalk font-semibold' : 'text-chalkdim'}`} aria-hidden="true">
                  {fmtDate(lang, dObj, { weekday: 'narrow' })}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {sheet && (
        <Sheet onClose={closeSheet} label={t('water.title')}>
          {sheet === 'custom' && <CustomView onClose={closeSheet} onAdd={async (v) => (await add(v)) && closeSheet()} />}
          {sheet === 'goal' && <GoalView goal={goal} onClose={closeSheet} onSave={onSaveGoal} />}
          {sheet === 'entries' && <EntriesView rows={dayRows} isToday={date === today} onClose={closeSheet} onDelete={remove} />}
        </Sheet>
      )}
    </Card>
  )
}

function SubmitBar({ busy, children }) {
  return (
    <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-line shrink-0">
      <Button type="submit" variant="brass" className="w-full min-h-[52px] text-base" disabled={busy}>
        {children}
      </Button>
    </div>
  )
}

const toInt = (s) => {
  const n = parseInt(String(s).replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function CustomView({ onClose, onAdd }) {
  const { t } = useLanguage()
  const [v, setV] = useState('300')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const step = (d) => setV((s) => String(Math.max(50, Math.min(MAX_DRINK_ML, toInt(s) + d * 50))))
  async function submit(e) {
    e.preventDefault()
    const n = toInt(v)
    if (n <= 0 || n > MAX_DRINK_ML) return setError(t('water.amountInvalid', { max: MAX_DRINK_ML }))
    setError('')
    setBusy(true)
    try {
      await onAdd(n)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SheetHeader title={t('water.customTitle')} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 flex flex-col gap-3">
          <Stepper value={v} unit={t('water.ml')} onChange={(s) => setV(s.replace(/[^\d]/g, ''))} onStep={step} />
          {error && (
            <p className="text-sm text-irontext" role="alert">
              {error}
            </p>
          )}
        </div>
        <SubmitBar busy={busy}>
          <Plus size={20} /> {t('water.add')}
        </SubmitBar>
      </form>
    </>
  )
}

function GoalView({ goal, onClose, onSave }) {
  const { t } = useLanguage()
  const [v, setV] = useState(String(goal ?? 2500))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const step = (d) => setV((s) => String(Math.max(GOAL_MIN, Math.min(GOAL_MAX, toInt(s) + d * 250))))
  async function submit(e) {
    e.preventDefault()
    const n = toInt(v)
    if (n < GOAL_MIN || n > GOAL_MAX) return setError(t('water.goalInvalid', { min: GOAL_MIN, max: GOAL_MAX }))
    setError('')
    setBusy(true)
    try {
      await onSave(n)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SheetHeader title={t('water.goalTitle')} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 flex flex-col gap-3">
          <Stepper value={v} unit={t('water.ml')} onChange={(s) => setV(s.replace(/[^\d]/g, ''))} onStep={step} />
          <div className="grid grid-cols-4 gap-2">
            {GOAL_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setV(String(p))} aria-pressed={toInt(v) === p} className={`min-h-[44px] rounded-md border text-sm press ${toInt(v) === p ? 'border-chalk bg-surface2' : 'border-line hover:border-chalk'}`}>
                <N mono>{litres(p)}</N> {t('water.litres')}
              </button>
            ))}
          </div>
          <p className="text-chalkdim text-sm">{t('water.goalHint')}</p>
          {error && (
            <p className="text-sm text-irontext" role="alert">
              {error}
            </p>
          )}
        </div>
        <SubmitBar busy={busy}>
          <Check size={20} /> {t('nutrition.save')}
        </SubmitBar>
      </form>
    </>
  )
}

function EntriesView({ rows, isToday, onClose, onDelete }) {
  const { t, lang } = useLanguage()
  const time = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return (
    <>
      <SheetHeader title={isToday ? t('water.entriesToday') : t('water.entries')} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
        {rows.length === 0 ? (
          <p className="text-chalkdim text-sm">{t('water.noEntries')}</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {[...rows].reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 ps-4 pe-1 min-h-[56px]">
                <span className="whitespace-nowrap">
                  <N mono className="text-base">{r.ml}</N> <span className="text-chalkdim text-sm">{t('water.ml')}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-chalkdim text-sm">
                    <N>{time(r.created_at)}</N>
                  </span>
                  <button type="button" onClick={() => onDelete(r.id)} aria-label={t('water.deleteEntry', { ml: r.ml })} className="w-11 h-11 inline-flex items-center justify-center rounded-md text-chalkdim hover:text-irontext hover:bg-surface2">
                    <Trash2 size={18} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
