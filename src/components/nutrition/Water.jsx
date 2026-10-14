import React, { useCallback, useEffect, useState } from 'react'
import { Check, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFeedback } from '../../context/FeedbackContext.jsx'
import { toLocalISODate } from '../../lib/dates.js'
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
import { N, Sheet, SheetHeader, Stepper } from './parts.jsx'

// Water card for the nutrition diary: the selected day's total against the
// goal, quick adds, and the seven days up to the selected one. Tapping a day
// moves the whole diary to it.

const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

export default function Water({ uid, date, today, onPickDate, onToast }) {
  const { t } = useLanguage()
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
  const L = t('water.litres')

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="water-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="water-h" className="text-[17px] font-semibold">{t('water.title')}</h2>
        <span className="flex items-center gap-1">
          <span className="text-chalkdim text-sm whitespace-nowrap">
            {goal != null ? (
              <>
                <N mono>{litres(total)}</N> {t('nutrition.of')} <N mono>{litres(goal)}</N> {L}
              </>
            ) : (
              <>
                <N mono>{litres(total)}</N> {L}
              </>
            )}
          </span>
          {dayRows.length > 0 && (
            <button type="button" onClick={() => setSheet('entries')} aria-label={t('water.entries')} title={t('water.entries')} className="w-11 h-11 -my-3 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press">
              <ListOrdered size={17} />
            </button>
          )}
          {goal != null ? (
            <button type="button" onClick={() => setSheet('goal')} aria-label={t('water.editGoal')} title={t('water.editGoal')} className="w-11 h-11 -my-3 -me-2 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-chalk press">
              <Pencil size={15} />
            </button>
          ) : (
            <button type="button" onClick={() => setSheet('goal')} className="min-h-[44px] -my-3 px-2 text-sm underline underline-offset-2 text-chalkdim hover:text-chalk">
              {t('water.setGoal')}
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_ML.map((v) => (
          <button key={v} type="button" onClick={() => add(v)} aria-label={t('water.addMl', { ml: v })} className="h-11 rounded-xl bg-surface2 hover:bg-white/10 press text-sm font-medium whitespace-nowrap">
            <N mono>+{v}</N>
          </button>
        ))}
        <button type="button" onClick={() => setSheet('custom')} className="h-11 rounded-xl bg-surface2 hover:bg-white/10 press text-sm text-chalkdim whitespace-nowrap">
          {t('water.other')}
        </button>
      </div>

      {sheet && (
        <Sheet onClose={closeSheet} label={t('water.title')}>
          {sheet === 'custom' && <CustomView onClose={closeSheet} onAdd={async (v) => (await add(v)) && closeSheet()} />}
          {sheet === 'goal' && <GoalView goal={goal} onClose={closeSheet} onSave={onSaveGoal} />}
          {sheet === 'entries' && <EntriesView rows={dayRows} isToday={date === today} onClose={closeSheet} onDelete={remove} />}
        </Sheet>
      )}
    </section>
  )
}

function SubmitBar({ busy, children }) {
  return (
    <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0">
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
              <button key={p} type="button" onClick={() => setV(String(p))} aria-pressed={toInt(v) === p} className={`min-h-[44px] rounded-xl text-sm press ${toInt(v) === p ? 'bg-chalk text-ink font-medium' : 'bg-surface2 hover:bg-white/10'}`}>
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
          <ul className="bg-surface2 rounded-[18px] divide-y divide-white/[0.06] overflow-hidden">
            {[...rows].reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 ps-4 pe-1 min-h-[56px]">
                <span className="whitespace-nowrap">
                  <N mono className="text-base">{r.ml}</N> <span className="text-chalkdim text-sm">{t('water.ml')}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-chalkdim text-sm">
                    <N>{time(r.created_at)}</N>
                  </span>
                  <button type="button" onClick={() => onDelete(r.id)} aria-label={t('water.deleteEntry', { ml: r.ml })} className="w-11 h-11 inline-flex items-center justify-center rounded-full text-chalkdim hover:text-irontext hover:bg-white/10">
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
