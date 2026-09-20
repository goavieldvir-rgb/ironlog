import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, setScheduleDay } from '../lib/db.js'
import { Card, Button, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'

// 0 = Sunday ... 6 = Saturday — matches both JS's native Date.getDay()
// and the weekly_schedule table's day_of_week column directly, so no
// conversion is needed anywhere in this component.
const DAYS = [0, 1, 2, 3, 4, 5, 6]

export default function WeeklySchedule({ effectiveUid, routines }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [schedule, , refreshSchedule] = useCollection(effectiveUid, 'weekly_schedule', 'day_of_week', 'asc')
  const [editingDay, setEditingDay] = useState(null)
  const [pickRoutineId, setPickRoutineId] = useState('')
  const [confirmingToday, setConfirmingToday] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().getDay()

  // A day with no row at all, or a row whose routine_id is null, are
  // both "rest day" — treated identically, never an ambiguous blank.
  function routineForDay(dow) {
    const row = schedule.find((s) => s.day_of_week === dow)
    if (!row || !row.routine_id) return null
    return routines.find((r) => r.id === row.routine_id) || null
  }

  function openEditor(dow) {
    setPickRoutineId(routineForDay(dow)?.id || '')
    setEditingDay(dow)
  }

  async function saveEditor() {
    setSaving(true)
    try {
      await setScheduleDay(effectiveUid, editingDay, pickRoutineId || null)
      refreshSchedule()
      setEditingDay(null)
    } finally {
      setSaving(false)
    }
  }

  function handleDayTap(dow) {
    // Tapping TODAY, when a routine is actually assigned, asks first —
    // it should never accidentally start a workout. Tapping any other
    // day (or a rest day today) just opens the editor directly.
    if (dow === today && routineForDay(dow)) {
      setConfirmingToday(true)
      return
    }
    openEditor(dow)
  }

  function startToday() {
    const r = routineForDay(today)
    setConfirmingToday(false)
    if (r) navigate(`/workout/${r.id}`)
  }

  return (
    <Card className="flex flex-col gap-1">
      <h2 className="eyebrow mb-1 inline-flex items-center gap-1">
        {t('dashboard.weeklySchedule')} <InfoTip text={t('dashboard.weeklyScheduleTip')} />
      </h2>

      {DAYS.map((dow) => {
        const r = routineForDay(dow)
        const isToday = dow === today
        return (
          <button
            key={dow}
            type="button"
            onClick={() => handleDayTap(dow)}
            className={`flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-start transition-colors ${
              isToday ? 'bg-ironsoft border border-iron/40' : 'hover:bg-surface2 border border-transparent'
            }`}
          >
            <span className={`text-sm inline-flex items-center gap-1.5 ${isToday ? 'text-chalk' : 'text-chalkdim'}`}>
              {t(`dashboard.day${dow}`)}
              {isToday && <span className="eyebrow text-iron">{t('dashboard.today')}</span>}
            </span>
            <span className={`text-sm truncate max-w-[55%] ${r ? 'text-chalk' : 'text-chalkdim italic'}`}>
              {r ? r.name : t('dashboard.restDay')}
            </span>
          </button>
        )
      })}

      {confirmingToday && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={() => setConfirmingToday(false)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl mb-4">{t('dashboard.startTodayConfirm', { name: routineForDay(today)?.name })}</h2>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={startToday}>
                {t('dashboard.startNow')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirmingToday(false)
                  openEditor(today)
                }}
              >
                {t('dashboard.changeInstead')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmingToday(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingDay != null && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={() => setEditingDay(null)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl mb-4">{t(`dashboard.day${editingDay}`)}</h2>
            <Field label={t('dashboard.assignRoutine')}>
              <select value={pickRoutineId} onChange={(e) => setPickRoutineId(e.target.value)} className="w-full">
                <option value="">{t('dashboard.restDay')}</option>
                {routines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 mt-5">
              <Button type="button" variant="ghost" onClick={() => setEditingDay(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={saveEditor} disabled={saving}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
