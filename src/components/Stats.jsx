import React, { useMemo, useState } from 'react'
import { Flame, TrendingUp, Trophy, BarChart3, Heart } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import ExerciseSelect from './ExerciseSelect.jsx'
import { useCollection } from '../lib/db.js'
import { toLocalISODate } from '../lib/dates.js'
import { disambiguateLabels } from '../lib/disambiguate.js'
import { Card, EmptyState, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'

const COLORS = { iron: '#D64545', brass: '#C9A24B', cardio: '#4C8CC9', chalk: '#EDEDE6', chalkdim: '#9CA0AA', grid: '#31353E' }

function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00')
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return toLocalISODate(d)
}

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function last12Mondays() {
  const thisMonday = mondayOf(toLocalISODate())
  const weeks = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisMonday + 'T00:00:00')
    d.setDate(d.getDate() - i * 7)
    weeks.push(toLocalISODate(d))
  }
  return weeks
}

export default function Stats() {
  const { effectiveUid } = useAdmin()
  const { t } = useLanguage()
  const [sessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [exerciseId, setExerciseId] = useState('')

  const weeks = useMemo(() => last12Mondays(), [])

  const weeklyData = useMemo(() => {
    return weeks.map((weekStart) => {
      const inWeek = sessions.filter((s) => mondayOf(s.date) === weekStart)
      let volume = 0
      let cardioMinutes = 0
      for (const s of inWeek) {
        for (const e of s.entries || []) {
          if (e.category === 'cardio') {
            cardioMinutes += (e.sets || []).reduce((sv, set) => sv + (Number(set.duration) || 0), 0)
          } else {
            volume += (e.sets || []).reduce((sv, set) => {
              const w = Number(set.weight)
              const r = Number(set.reps)
              return sv + (isFinite(w) && isFinite(r) ? w * r : 0)
            }, 0)
          }
        }
      }
      return {
        week: weekStart,
        label: shortDate(weekStart),
        sessions: inWeek.length,
        volume: Math.round(volume),
        cardioMinutes: Math.round(cardioMinutes),
      }
    })
  }, [sessions, weeks])

  const streak = useMemo(() => {
    let count = 0
    for (let i = weeklyData.length - 1; i >= 0; i--) {
      if (weeklyData[i].sessions > 0) count++
      else break
    }
    return count
  }, [weeklyData])

  const totalVolume = useMemo(() => weeklyData.reduce((s, w) => s + w.volume, 0), [weeklyData])
  const totalCardioMinutes = useMemo(() => weeklyData.reduce((s, w) => s + w.cardioMinutes, 0), [weeklyData])
  const hasCardio = useMemo(
    () => totalCardioMinutes > 0 || sessions.some((s) => (s.entries || []).some((e) => e.category === 'cardio')),
    [totalCardioMinutes, sessions],
  )

  // Personal records + per-exercise progress history, derived straight from
  // the sets people logged (no need for a separate exercises fetch).
  const { records, exerciseOptions, progressByExercise } = useMemo(() => {
    const recMap = {}
    const progMap = {}

    for (const s of sessions) {
      for (const entry of s.entries || []) {
        if (!entry.exerciseId) continue

        if (entry.category === 'cardio') {
          const completed = (entry.sets || []).filter((set) => set.duration !== '' && set.duration != null)
          if (completed.length === 0) continue
          const topSet = completed.reduce((best, set) => (Number(set.duration) > Number(best.duration) ? set : best))

          const existing = recMap[entry.exerciseId]
          if (!existing || Number(topSet.duration) > existing.duration) {
            recMap[entry.exerciseId] = {
              name: entry.name,
              category: 'cardio',
              unit: entry.unit,
              intensityType: entry.intensityType,
              duration: Number(topSet.duration),
              intensity: Number(topSet.intensity) || 0,
              distance: topSet.distance !== '' && topSet.distance != null ? Number(topSet.distance) : null,
              date: s.date,
            }
          }

          if (!progMap[entry.exerciseId]) {
            progMap[entry.exerciseId] = { name: entry.name, category: 'cardio', unit: entry.unit, intensityType: entry.intensityType, points: [] }
          }
          progMap[entry.exerciseId].points.push({
            date: s.date,
            label: shortDate(s.date),
            duration: Number(topSet.duration),
          })
          continue
        }

        const completed = (entry.sets || []).filter((set) => {
          const repsOk = set.reps !== '' && set.reps != null
          const weightOk = entry.bodyweight ? true : set.weight !== '' && set.weight != null
          return repsOk && weightOk
        })
        if (completed.length === 0) continue

        const topSet = entry.bodyweight
          ? completed.reduce((best, set) => (Number(set.reps) > Number(best.reps) ? set : best))
          : completed.reduce((best, set) => (Number(set.weight) > Number(best.weight) ? set : best))

        const existing = recMap[entry.exerciseId]
        const isNewBest = entry.bodyweight
          ? !existing || Number(topSet.reps) > existing.reps
          : !existing || Number(topSet.weight) > existing.weight
        if (isNewBest) {
          recMap[entry.exerciseId] = {
            name: entry.name,
            category: entry.category || 'strength',
            unit: entry.unit,
            bodyweight: !!entry.bodyweight,
            weight: Number(topSet.weight) || 0,
            reps: Number(topSet.reps),
            date: s.date,
          }
        }

        if (!progMap[entry.exerciseId]) {
          progMap[entry.exerciseId] = { name: entry.name, category: entry.category, unit: entry.unit, bodyweight: !!entry.bodyweight, points: [] }
        }
        progMap[entry.exerciseId].points.push({
          date: s.date,
          label: shortDate(s.date),
          weight: Number(topSet.weight) || 0,
          reps: Number(topSet.reps),
        })
      }
    }

    const records = Object.entries(recMap)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const exerciseOptions = Object.entries(progMap).map(([id, p]) => ({ id, name: p.name, category: p.category, unit: p.unit, bodyweight: p.bodyweight, intensityType: p.intensityType }))
    exerciseOptions.sort((a, b) => a.name.localeCompare(b.name))

    // Sessions come back newest-first (needed elsewhere), but a progress
    // line chart only makes sense read oldest-to-newest, left to right.
    // Without this, the most recent point would plot on the left and the
    // oldest on the right — backwards.
    for (const key of Object.keys(progMap)) {
      progMap[key].points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    }

    return { records, exerciseOptions, progressByExercise: progMap }
  }, [sessions])

  // If two exercises share a name (possible now that tracking method can
  // differ between "variants" of the same movement), append a short
  // disambiguating suffix — "(kg)" vs "(lb)", "(Bodyweight)", "(RPE)" vs
  // "(HR Zone)" — so the dropdown and PR list never show two identical
  // entries with no way to tell them apart.
  const recordLabels = useMemo(() => disambiguateLabels(records, (r) => r.name, t), [records, t])
  const exerciseOptionLabels = useMemo(() => disambiguateLabels(exerciseOptions, (e) => e.name, t), [exerciseOptions, t])

  const selectedProgress = exerciseId ? progressByExercise[exerciseId] : null

  const hasData = !loading && sessions.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">{t('stats.insights')}</div>
        <h1 className="text-3xl">{t('stats.title')}</h1>
      </div>

      {!loading && sessions.length === 0 && (
        <EmptyState
          title={t('stats.emptyTitle')}
          body={t('stats.emptyBody')}
        />
      )}

      {hasData && (
        <>
          <div className={`grid grid-cols-2 ${hasCardio ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
            <Stat icon={Flame} label={t('stats.weekStreak')} value={streak} />
            <Stat icon={BarChart3} label={t('stats.sessionsLogged')} value={sessions.length} />
            <Stat icon={TrendingUp} label={t('stats.totalVolume')} value={totalVolume.toLocaleString()} />
            {hasCardio && <Stat icon={Heart} label={t('stats.cardioMinutes')} value={totalCardioMinutes.toLocaleString()} />}
            <Stat icon={Trophy} label={t('stats.personalRecords')} value={records.length} />
          </div>

          <Card>
            <h2 className="eyebrow mb-4">{t('stats.sessionsPerWeek')}</h2>
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={COLORS.chalkdim} fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: COLORS.chalk }}
                  />
                  <Bar dataKey="sessions" fill={COLORS.iron} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h2 className="eyebrow mb-4">{t('stats.volumePerWeek')}</h2>
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: COLORS.chalk }}
                  />
                  <Bar dataKey="volume" fill={COLORS.brass} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-chalkdim text-xs mt-2">
              {t('stats.volumeNote')}
            </p>
          </Card>

          {hasCardio && (
            <Card>
              <h2 className="eyebrow mb-4">{t('stats.cardioPerWeek')}</h2>
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                      labelStyle={{ color: COLORS.chalk }}
                      formatter={(value) => [`${value} min`, t('stats.cardioTooltipLabel')]}
                    />
                    <Bar dataKey="cardioMinutes" fill={COLORS.cardio} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <h2 className="eyebrow flex items-center gap-1.5 flex-wrap">
              {t('stats.progressByExercise')}
              <InfoTip text={t('stats.progressTip')} />
            </h2>
            <Field label={t('stats.exercise')}>
              <ExerciseSelect
                value={exerciseId}
                onChange={setExerciseId}
                options={exerciseOptions.map((e, i) => ({ id: e.id, label: exerciseOptionLabels[i] }))}
                placeholder={t('stats.chooseExercise')}
                className="w-full sm:w-72"
              />
            </Field>

            {selectedProgress && selectedProgress.points.length > 0 ? (
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={selectedProgress.points}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke={COLORS.chalkdim}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      domain={selectedProgress.category === 'cardio' || selectedProgress.bodyweight ? [0, 'dataMax + 5'] : ['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                      labelStyle={{ color: COLORS.chalk }}
                      formatter={(value) => {
                        if (selectedProgress.category === 'cardio') return [`${value} min`, t('stats.duration')]
                        if (selectedProgress.bodyweight) return [`${value} reps`, t('stats.topSet')]
                        return [`${value}${selectedProgress.unit}`, t('stats.topSet')]
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={selectedProgress.category === 'cardio' ? 'duration' : selectedProgress.bodyweight ? 'reps' : 'weight'}
                      stroke={selectedProgress.category === 'cardio' ? COLORS.cardio : COLORS.iron}
                      strokeWidth={2.5}
                      dot={{ fill: selectedProgress.category === 'cardio' ? COLORS.cardio : COLORS.iron, r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-chalkdim text-sm">{t('stats.pickToSee')}</p>
            )}
            {selectedProgress?.category === 'cardio' && (
              <p className="text-chalkdim text-xs">{t('stats.cardioTrackingNote')}</p>
            )}
            {selectedProgress?.bodyweight && selectedProgress?.category !== 'cardio' && (
              <p className="text-chalkdim text-xs">
                {t('stats.bodyweightTrackingNote')}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="eyebrow mb-1 flex items-center gap-1.5 flex-wrap">
              {t('stats.personalRecords')}
              <InfoTip text={t('stats.recordsTip')} />
            </h2>
            {records.length === 0 ? (
              <p className="text-chalkdim text-sm">{t('stats.noCompletedSets')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {records.map((r, i) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                    <p className="truncate min-w-0">{recordLabels[i]}</p>
                    <div className="text-end shrink-0">
                      <p className="num text-chalk">
                        {r.category === 'cardio'
                          ? `${r.duration} ${t('sessionCard.minUnit')} · ${r.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')} ${r.intensity}${
                              r.distance != null ? ` · ${r.distance}${r.unit}` : ''
                            }`
                          : r.bodyweight
                            ? `${r.weight > 0 ? `+${r.weight}${r.unit} ` : ''}${t('sessionCard.bwShort')} × ${r.reps}`
                            : `${r.weight}${r.unit} × ${r.reps}`}
                      </p>
                      <p className="text-chalkdim text-xs">{shortDate(r.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <Card className="flex flex-col items-center justify-center py-5 gap-1.5 text-center">
      <Icon size={18} className="text-brass" />
      <span className="num text-3xl text-chalk leading-none">{value}</span>
      <span className="text-chalkdim text-xs">{label}</span>
    </Card>
  )
}
