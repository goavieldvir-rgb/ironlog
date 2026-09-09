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
import { useCollection } from '../lib/db.js'
import { Card, EmptyState, Field } from './ui.jsx'

const COLORS = { iron: '#D64545', brass: '#C9A24B', cardio: '#4C8CC9', chalk: '#EDEDE6', chalkdim: '#9CA0AA', grid: '#31353E' }

function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00')
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function last12Mondays() {
  const thisMonday = mondayOf(new Date().toISOString().slice(0, 10))
  const weeks = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisMonday + 'T00:00:00')
    d.setDate(d.getDate() - i * 7)
    weeks.push(d.toISOString().slice(0, 10))
  }
  return weeks
}

export default function Stats() {
  const { effectiveUid } = useAdmin()
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
            progMap[entry.exerciseId] = { name: entry.name, category: 'cardio', unit: entry.unit, points: [] }
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

    const exerciseOptions = Object.entries(progMap).map(([id, p]) => ({ id, name: p.name }))
    exerciseOptions.sort((a, b) => a.name.localeCompare(b.name))

    return { records, exerciseOptions, progressByExercise: progMap }
  }, [sessions])

  const selectedProgress = exerciseId ? progressByExercise[exerciseId] : null

  const hasData = !loading && sessions.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">Insights</div>
        <h1 className="text-3xl">Statistics</h1>
      </div>

      {!loading && sessions.length === 0 && (
        <EmptyState
          title="Nothing to show yet"
          body="Log a few sessions and this page will fill in with streaks, volume, personal records, and progress charts."
        />
      )}

      {hasData && (
        <>
          <div className={`grid grid-cols-2 ${hasCardio ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
            <Stat icon={Flame} label="Week streak" value={streak} />
            <Stat icon={BarChart3} label="Sessions logged" value={sessions.length} />
            <Stat icon={TrendingUp} label="Total volume" value={totalVolume.toLocaleString()} />
            {hasCardio && <Stat icon={Heart} label="Cardio minutes" value={totalCardioMinutes.toLocaleString()} />}
            <Stat icon={Trophy} label="Personal records" value={records.length} />
          </div>

          <Card>
            <h2 className="eyebrow mb-4">Sessions per week (last 12 weeks)</h2>
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
          </Card>

          <Card>
            <h2 className="eyebrow mb-4">Total volume per week</h2>
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
            <p className="text-chalkdim text-xs mt-2">
              Volume = weight × reps summed across all sets. Treat this as a rough trend line rather than an
              exact number if you log in mixed units.
            </p>
          </Card>

          {hasCardio && (
            <Card>
              <h2 className="eyebrow mb-4">Cardio minutes per week</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: COLORS.chalk }}
                    formatter={(value) => [`${value} min`, 'Cardio']}
                  />
                  <Bar dataKey="cardioMinutes" fill={COLORS.cardio} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <h2 className="eyebrow">Progress by exercise</h2>
            <Field label="Exercise">
              <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className="w-56">
                <option value="">Choose an exercise…</option>
                {exerciseOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>

            {selectedProgress && selectedProgress.points.length > 0 ? (
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
                      if (selectedProgress.category === 'cardio') return [`${value} min`, 'Duration']
                      if (selectedProgress.bodyweight) return [`${value} reps`, 'Top set']
                      return [`${value}${selectedProgress.unit}`, 'Top set']
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
            ) : (
              <p className="text-chalkdim text-sm">Pick an exercise above to see your progress over time.</p>
            )}
            {selectedProgress?.category === 'cardio' && (
              <p className="text-chalkdim text-xs">Tracking your longest single interval per session, in minutes.</p>
            )}
            {selectedProgress?.bodyweight && selectedProgress?.category !== 'cardio' && (
              <p className="text-chalkdim text-xs">
                Bodyweight exercise — tracking reps per session rather than weight, since added weight is optional.
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="eyebrow mb-1">Personal records</h2>
            {records.length === 0 ? (
              <p className="text-chalkdim text-sm">No completed sets logged yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {records.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                    <p className="truncate min-w-0">{r.name}</p>
                    <div className="text-right shrink-0">
                      <p className="num text-chalk">
                        {r.category === 'cardio'
                          ? `${r.duration} min · ${r.intensityType === 'hr_zone' ? 'Zone' : 'RPE'} ${r.intensity}${
                              r.distance != null ? ` · ${r.distance}${r.unit}` : ''
                            }`
                          : r.bodyweight
                            ? `${r.weight > 0 ? `+${r.weight}${r.unit} ` : ''}BW × ${r.reps}`
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
