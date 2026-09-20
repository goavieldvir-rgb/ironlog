import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection, setScheduleDay } from '../lib/db.js'
import { Card, Button, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'

// 0 = Sunday ... 6 = Saturday — matches JS's native Date.getDay() and the
// weekly_schedule table's day_of_week column directly.
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const SLOTS = [0, 1, 2]
const SLOT_LABEL_KEYS = ['slotMobility', 'slotStrength', 'slotCardio']

export default function WeeklySchedule({ effectiveUid, routines }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [schedule, , refreshSchedule] = useCollection(effectiveUid, 'weekly_schedule', 'day_of_week', 'asc')
  const [editingDay, setEditingDay] = useState(null)
  const [pickIds, setPickIds] = useState(['', '', ''])
  const [confirmingToday, setConfirmingToday] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().getDay()

  // Every routine actually assigned to a day, across all 3 slots, in
  // slot order — filters out empty slots entirely, so an empty slot 1
  // with something in slot 2 doesn't show as a confusing gap.
  function routinesForDay(dow) {
    return SLOTS.map((slot) => {
      const row = schedule.find((s) => s.day_of_week === dow && s.slot === slot)
      if (!row || !row.routine_id) return null
      return routines.find((r) => r.id === row.routine_id) || null
    }).filter(Boolean)
  }

  function openEditor(dow) {
    const next = ['', '', '']
    SLOTS.forEach((slot) => {
      const row = schedule.find((s) => s.day_of_week === dow && s.slot === slot)
      next[slot] = row?.routine_id || ''
    })
    setPickIds(next)
    setEditingDay(dow)
  }

  async function saveEditor() {
    setSaving(true)
    try {
      for (const slot of SLOTS) {
        await setScheduleDay(effectiveUid, editingDay, slot, pickIds[slot] || null)
      }
      refreshSchedule()
      setEditingDay(null)
    } finally {
      setSaving(false)
    }
  }

  function handleDayTap(dow) {
    // Tapping TODAY, when at least one routine is actually assigned,
    // asks first — it should never accidentally start a workout. Any
    // other day (or a rest day today) just opens the editor directly.
    if (dow === today && routinesForDay(dow).length > 0) {
      setConfirmingToday(true)
      return
    }
    openEditor(dow)
  }

  return (
    <Card className="flex flex-col gap-1">
      <h2 className="eyebrow mb-1 inline-flex items-center gap-1">
        {t('dashboard.weeklySchedule')} <InfoTip text={t('dashboard.weeklyScheduleTip')} />
      </h2>

      {DAYS.map((dow) => {
        const dayRoutines = routinesForDay(dow)
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
            <span className={`text-sm inline-flex items-center gap-1.5 shrink-0 ${isToday ? 'text-chalk' : 'text-chalkdim'}`}>
              {t(`dashboard.day${dow}`)}
              {isToday && <span className="eyebrow text-iron">{t('dashboard.today')}</span>}
            </span>
            <span className={`text-sm truncate max-w-[60%] ${dayRoutines.length > 0 ? 'text-chalk' : 'text-chalkdim italic'}`}>
              {dayRoutines.length > 0 ? dayRoutines.map((r) => r.name).join(' + ') : t('dashboard.restDay')}
            </span>
          </button>
        )
      })}

      {confirmingToday && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={() => setConfirmingToday(false)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl mb-4">{t('dashboard.startTodayTitle')}</h2>
            <div className="flex flex-col gap-2">
              {routinesForDay(today).map((r) => (
                <Button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setConfirmingToday(false)
                    navigate(`/workout/${r.id}`)
                  }}
                  className="justify-between"
                >
                  <span className="truncate">{r.name}</span>
                  <Play size={15} className="shrink-0" />
                </Button>
              ))}
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
            <h2 className="text-xl mb-1">{t(`dashboard.day${editingDay}`)}</h2>
            <p className="text-chalkdim text-xs mb-4">{t('dashboard.upToThree')}</p>
            <div className="flex flex-col gap-3">
              {SLOTS.map((slot) => (
                <Field key={slot} label={t(`dashboard.${SLOT_LABEL_KEYS[slot]}`)}>
                  <select
                    value={pickIds[slot]}
                    onChange={(e) => setPickIds((prev) => prev.map((v, i) => (i === slot ? e.target.value : v)))}
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
