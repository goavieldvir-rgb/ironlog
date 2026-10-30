import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGyms, sessionGymId, gymLabel } from '../lib/gyms.js'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import ExerciseSelect from './ExerciseSelect.jsx'
import { useCollection } from '../lib/db.js'
import { entryName, exerciseMap } from '../lib/names.js'
import { toLocalISODate, fmtDate, dateLocale, weekStartOf } from '../lib/dates.js'
import { disambiguateLabels } from '../lib/disambiguate.js'
import { EmptyState, LoadError, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { currentStreak } from '../lib/streak.js'
import { cardioSummary, formatPace, formatSpeed, formatDistance, toKm } from '../lib/cardio.js'
import { ACCENT, CHALK, CHALKDIM, MUTED, GRID, SURFACE } from '../theme.js'

const COLORS = { iron: ACCENT, brass: ACCENT, cardio: MUTED, chalk: CHALK, chalkdim: CHALKDIM, grid: GRID }


function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}

function last12WeekStarts() {
  const thisWeekStart = weekStartOf(toLocalISODate())
  const weeks = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisWeekStart + 'T00:00:00')
    d.setDate(d.getDate() - i * 7)
    weeks.push(toLocalISODate(d))
  }
  return weeks
}

export default function Stats() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const [rawSessions, loading, refreshSessions, loadError] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const sessions = useMemo(() => applyCurrentTimed(rawSessions, exercises), [rawSessions, exercises])
  // null = nothing picked yet (the deep link or the most recent exercise
  // fills in); '' = the lifter cleared the picker on purpose.
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('exercise')
  const [pickedId, setPickedId] = useState(null)
  // A link tapped while this page is already open (same route) re-aims it.
  useEffect(() => {
    setPickedId(null)
  }, [linkedId])
  // Progress and records for one gym, or 'all'. Only shown to someone who
  // trains at several gyms; '' is the main gym.
  const { gyms, mainName, enabled: gymsOn } = useGyms(effectiveUid)
  const [gymFilter, setGymFilter] = useState('all')
  const gymSessions = useMemo(
    () =>
      // A gym removed while selected falls back to all gyms.
      !gymsOn || gymFilter === 'all' || (gymFilter && !gyms.some((g) => g.id === gymFilter))
        ? sessions
        : sessions.filter((s) => (sessionGymId(s, gyms) || '') === gymFilter),
    [sessions, gymsOn, gyms, gymFilter],
  )
  const [cardioMetric, setCardioMetric] = useState('duration')
  const [liftMetric, setLiftMetric] = useState('weight')

  const weeks = useMemo(() => last12WeekStarts(), [])

  const weeklyData = useMemo(() => {
    return weeks.map((weekStart) => {
      const inWeek = sessions.filter((s) => weekStartOf(s.date) === weekStart)
      let volume = 0
      let cardioMinutes = 0
      let cardioKm = 0
      for (const s of inWeek) {
        for (const e of s.entries || []) {
          if (e.category === 'cardio') {
            cardioMinutes += (e.sets || []).reduce((sv, set) => sv + (Number(set.duration) || 0), 0)
            const c = cardioSummary(e.sets)
            if (c && c.distance != null) cardioKm += toKm(c.distance, e.unit)
          } else if (!e.timed) {
            // Holds have no weight × reps volume — their reps are seconds.
            volume += workingSets(e.sets).reduce((sv, set) => {
              const w = Number(set.weight)
              const r = Number(set.reps)
              return sv + (isFinite(w) && isFinite(r) ? w * r : 0)
            }, 0)
          }
        }
      }
      return {
        week: weekStart,
        label: shortDate(lang, weekStart),
        sessions: inWeek.length,
        volume: Math.round(volume),
        cardioMinutes: Math.round(cardioMinutes),
        cardioKm: Math.round(cardioKm * 10) / 10,
      }
    })
  }, [sessions, weeks, lang])

  // Same count as the saved-workout screen. This week doesn't break the
  // streak until it's over, and it isn't capped at the 12 weeks charted.
  const streak = useMemo(() => currentStreak(sessions), [sessions])

  const totalVolume = useMemo(() => weeklyData.reduce((s, w) => s + w.volume, 0), [weeklyData])
  const totalCardioMinutes = useMemo(() => weeklyData.reduce((s, w) => s + w.cardioMinutes, 0), [weeklyData])
  const totalCardioKm = useMemo(() => weeklyData.reduce((s, w) => s + w.cardioKm, 0), [weeklyData])
  const hasCardio = useMemo(
    () => totalCardioMinutes > 0 || sessions.some((s) => (s.entries || []).some((e) => e.category === 'cardio')),
    [totalCardioMinutes, sessions],
  )

  // Personal records + per-exercise progress history, derived straight from
  // the sets people logged (no need for a separate exercises fetch).
  const { records, exerciseOptions, recentIds, progressByExercise } = useMemo(() => {
    const exById = exerciseMap(exercises)
    const recMap = {}
    const progMap = {}

    for (const s of gymSessions) {
      for (const entry of s.entries || []) {
        if (!entry.exerciseId) continue

        if (entry.category === 'cardio') {
          const completed = (entry.sets || []).filter((set) => set.duration !== '' && set.duration != null)
          if (completed.length === 0) continue
          const topSet = completed.reduce((best, set) => (Number(set.duration) > Number(best.duration) ? set : best))

          // Whole-workout numbers for the chart: total time, distance,
          // speed, pace and average effort (null when not logged).
          const sum = cardioSummary(entry.sets)
          if (!sum) continue

          const existing = recMap[entry.exerciseId]
          if (!existing || Number(topSet.duration) > existing.duration) {
            recMap[entry.exerciseId] = {
              // Farthest and best pace are kept across sessions, whichever
              // one holds the longest interval.
              farthest: existing?.farthest ?? null,
              bestPace: existing?.bestPace ?? null,
              name: entryName(entry, exById, lang),
              category: 'cardio',
              unit: entry.unit,
              intensityType: entry.intensityType,
              duration: Number(topSet.duration),
              intensity: Number(topSet.intensity) || 0,
              distance: topSet.distance !== '' && topSet.distance != null ? Number(topSet.distance) : null,
              date: s.date,
            }
          }

          const r = recMap[entry.exerciseId]
          if (sum.distance != null && (r.farthest == null || sum.distance > r.farthest)) r.farthest = sum.distance
          if (sum.pace != null && (r.bestPace == null || sum.pace < r.bestPace)) r.bestPace = sum.pace
          if (!progMap[entry.exerciseId]) {
            progMap[entry.exerciseId] = { name: entryName(entry, exById, lang), category: 'cardio', unit: entry.unit, intensityType: entry.intensityType, points: [] }
          }
          progMap[entry.exerciseId].points.push({
            date: s.date,
            label: shortDate(lang, s.date),
            duration: sum.minutes,
            distance: sum.distance,
            speed: sum.speed,
            pace: sum.pace,
            effort: sum.intensity,
          })
          continue
        }

        const completed = workingSets(entry.sets).filter((set) => {
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
            name: entryName(entry, exById, lang),
            category: entry.category || 'strength',
            unit: entry.unit,
            bodyweight: !!entry.bodyweight,
            timed: !!entry.timed,
            weight: Number(topSet.weight) || 0,
            reps: Number(topSet.reps),
            date: s.date,
          }
        }

        if (!progMap[entry.exerciseId]) {
          progMap[entry.exerciseId] = { name: entryName(entry, exById, lang), category: entry.category, unit: entry.unit, bodyweight: !!entry.bodyweight, timed: !!entry.timed, points: [] }
        }
        // Est. 1RM (Epley) only from sets of 1-12 reps, where it's reliable;
        // volume is every working set's weight x reps.
        let e1rm = null
        let volume = 0
        for (const set of completed) {
          const w = Number(set.weight)
          const r = Number(set.reps)
          if (!isFinite(w) || !isFinite(r)) continue
          volume += w * r
          if (w > 0 && r >= 1 && r <= 12) e1rm = Math.max(e1rm ?? 0, w * (1 + r / 30))
        }
        progMap[entry.exerciseId].points.push({
          date: s.date,
          label: shortDate(lang, s.date),
          weight: Number(topSet.weight) || 0,
          reps: Number(topSet.reps),
          e1rm: e1rm == null ? null : Math.round(e1rm * 10) / 10,
          volume: Math.round(volume),
        })
      }
    }

    const records = Object.entries(recMap)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const exerciseOptions = Object.entries(progMap).map(([id, p]) => ({ id, name: p.name, category: p.category, unit: p.unit, bodyweight: p.bodyweight, timed: p.timed, intensityType: p.intensityType }))
    exerciseOptions.sort((a, b) => a.name.localeCompare(b.name))
    // Most recently trained first (points are date-sorted below), for the
    // default pick and the top of the picker.
    const lastTrained = (id) => progMap[id].points.reduce((m, p) => (p.date > m ? p.date : m), '')
    const recentIds = exerciseOptions
      .map((e) => e.id)
      .sort((a, b) => (lastTrained(a) < lastTrained(b) ? 1 : lastTrained(a) > lastTrained(b) ? -1 : 0))
      .slice(0, 5)

    // Sessions come back newest-first (needed elsewhere), but a progress
    // line chart only makes sense read oldest-to-newest, left to right.
    // Without this, the most recent point would plot on the left and the
    // oldest on the right — backwards.
    for (const key of Object.keys(progMap)) {
      const pts = progMap[key].points
      pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      // One point per day: two workouts on the same date keep the best one.
      // Cardio points are whole-workout numbers, so they're left as they are.
      if (progMap[key].category === 'cardio') continue
      const bw = progMap[key].bodyweight
      const merged = []
      for (const p of pts) {
        const last = merged[merged.length - 1]
        if (!last || last.date !== p.date) {
          merged.push({ ...p })
          continue
        }
        if (bw ? p.reps > last.reps : p.weight > last.weight || (p.weight === last.weight && p.reps > last.reps)) {
          last.weight = p.weight
          last.reps = p.reps
        }
        if (p.e1rm != null && (last.e1rm == null || p.e1rm > last.e1rm)) last.e1rm = p.e1rm
        last.volume = Math.max(last.volume, p.volume)
      }
      progMap[key].points = merged
    }

    return { records, exerciseOptions, recentIds, progressByExercise: progMap }
  }, [gymSessions, exercises, lang])

  // If two exercises share a name (possible now that tracking method can
  // differ between "variants" of the same movement), append a short
  // disambiguating suffix — "(kg)" vs "(lb)", "(Bodyweight)", "(RPE)" vs
  // "(HR Zone)" — so the dropdown and PR list never show two identical
  // entries with no way to tell them apart.
  const recordLabels = useMemo(() => disambiguateLabels(records, (r) => r.name, t), [records, t])
  const exerciseOptionLabels = useMemo(() => disambiguateLabels(exerciseOptions, (e) => e.name, t), [exerciseOptions, t])

  // The picked exercise, else the one in the link, else the one trained last.
  const exerciseId = pickedId ?? (progressByExercise[linkedId] ? linkedId : recentIds[0] || '')
  const selectedProgress = exerciseId ? progressByExercise[exerciseId] : null
  const pickerOptions = useMemo(() => {
    const labelOf = new Map(exerciseOptions.map((e, i) => [e.id, exerciseOptionLabels[i]]))
    // Recent first, then everything else alphabetically.
    const ids = [...recentIds, ...exerciseOptions.map((e) => e.id).filter((id) => !recentIds.includes(id))]
    return ids.map((id) => ({ id, label: labelOf.get(id) }))
  }, [exerciseOptions, exerciseOptionLabels, recentIds])

  // Cardio chart: time is always there; the others only when logged.
  const isCardioSel = selectedProgress?.category === 'cardio'
  const cardioMetrics = isCardioSel
    ? ['duration', 'distance', 'speed', 'pace', 'effort'].filter((k) => k === 'duration' || selectedProgress.points.some((p) => p[k] != null))
    : []
  const metric = cardioMetrics.includes(cardioMetric) ? cardioMetric : 'duration'
  const distUnit = selectedProgress?.unit === 'mi' ? 'mi' : 'km'
  const metricLabel = {
    duration: t('stats.metricTime'),
    distance: t('stats.metricDistance'),
    speed: t('stats.metricSpeed'),
    pace: t('stats.metricPace'),
    effort: selectedProgress?.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe'),
  }
  // Weighted lifts: top weight, estimated 1RM or volume. Bodyweight, timed
  // and cardio keep their single line.
  const isLiftSel = !!selectedProgress && !isCardioSel && !selectedProgress.bodyweight && !selectedProgress.timed
  const liftMetrics = isLiftSel
    ? ['weight', 'e1rm', 'volume'].filter((k) => k === 'weight' || selectedProgress.points.some((p) => p[k] != null && p[k] > 0))
    : []
  const lift = liftMetrics.includes(liftMetric) ? liftMetric : 'weight'
  const liftLabel = { weight: t('stats.metricTopWeight'), e1rm: t('stats.metricE1rm'), volume: t('stats.metricVolume') }
  const dataKey = isCardioSel ? metric : selectedProgress?.bodyweight ? 'reps' : isLiftSel ? lift : 'weight'
  // Pad the y-axis by ~8% of the data's own range, so a 2.5 kg change
  // reads as a change and a flat line isn't pinned to the edge.
  const paddedDomain = useMemo(() => {
    if (!selectedProgress) return ['auto', 'auto']
    const vals = selectedProgress.points.map((p) => p[dataKey]).filter((v) => v != null && isFinite(v))
    if (vals.length === 0) return ['auto', 'auto']
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = hi > lo ? (hi - lo) * 0.08 : Math.max(hi * 0.05, 1)
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]
  }, [selectedProgress, dataKey])
  const loadFailed = !!loadError && rawSessions.length === 0
  const hasData = !loading && sessions.length > 0

  const nf = (n) => n.toLocaleString(dateLocale(lang))
  const current = weeklyData[weeklyData.length - 1]
  const headline = streak === 0 ? t('stats.streakNone') : streak === 1 ? t('stats.streakOne') : t('stats.streakMany', { n: streak })
  const supportParts = [
    sessions.length === 1 ? t('stats.partSessionsOne') : t('stats.partSessions', { n: nf(sessions.length) }),
    t('stats.partVolume', { n: nf(totalVolume) }),
    records.length === 1 ? t('stats.partRecordsOne') : t('stats.partRecords', { n: records.length }),
  ]
  if (hasCardio) supportParts.push(t('stats.partCardioMin', { n: nf(totalCardioMinutes) }))
  if (totalCardioKm > 0) supportParts.push(t('stats.partCardioKm', { n: formatDistance(totalCardioKm) }))

  return (
    <div className="flex flex-col gap-6 pb-[120px]">
      <h1 className="text-[30px] leading-9">{t('stats.title')}</h1>

      {!loading && loadFailed && <LoadError onRetry={refreshSessions} />}

      {!loading && !loadFailed && sessions.length === 0 && (
        <EmptyState
          title={t('stats.emptyTitle')}
          body={t('stats.emptyBody')}
        />
      )}

      {hasData && (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-[26px] leading-8 font-semibold tracking-[-0.015em] tabular-nums">{headline}</p>
            <p className="text-[15px] leading-[21px] text-chalkdim tabular-nums">{supportParts.join(' · ')}</p>
          </div>

          <WeeklyChart
            title={t('stats.sessionsPerWeek')}
            caption={t('stats.thisWeekValue', { value: nf(current.sessions) })}
            data={weeklyData}
            dataKey="sessions"
            yWidth={28}
            allowDecimals={false}
          />

          <WeeklyChart
            title={t('stats.volumePerWeek')}
            caption={t('stats.thisWeekValue', { value: nf(current.volume) })}
            data={weeklyData}
            dataKey="volume"
            yWidth={44}
            note={t('stats.volumeNote')}
          />

          {hasCardio && (
            <WeeklyChart
              title={t('stats.cardioPerWeek')}
              caption={t('stats.thisWeekValue', { value: `${nf(current.cardioMinutes)} ${t('sessionCard.minUnit')}` })}
              data={weeklyData}
              dataKey="cardioMinutes"
              yWidth={36}
              tooltipFormatter={(value) => [`${value} min`, t('stats.cardioTooltipLabel')]}
            />
          )}

          {totalCardioKm > 0 && (
            <WeeklyChart
              title={t('stats.cardioDistancePerWeek')}
              caption={t('stats.thisWeekValue', { value: `${formatDistance(current.cardioKm)} km` })}
              data={weeklyData}
              dataKey="cardioKm"
              yWidth={36}
              tooltipFormatter={(value) => [`${value} km`, t('stats.cardioTooltipLabel')]}
            />
          )}

          {gymsOn && (
            <Field label={t('gyms.statsFilter')}>
              <select value={gymFilter && !gyms.some((g) => g.id === gymFilter) ? 'all' : gymFilter} onChange={(e) => setGymFilter(e.target.value)} className="w-full sm:w-72">
                <option value="all">{t('gyms.allGyms')}</option>
                <option value="">{gymLabel(null, gyms, mainName, t)}</option>
                {gyms.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <section className="bg-surface rounded-[22px] p-[18px] flex flex-col gap-3">
            <h2 className="text-[15px] leading-5 flex items-center gap-1.5 flex-wrap">
              {t('stats.progressByExercise')}
              <InfoTip text={t('stats.progressTip')} />
            </h2>
            <Field label={t('stats.exercise')}>
              <ExerciseSelect
                value={exerciseId}
                onChange={setPickedId}
                options={pickerOptions}
                placeholder={t('stats.chooseExercise')}
                className="w-full sm:w-72"
              />
            </Field>

            {cardioMetrics.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('stats.chartShows')}>
                {cardioMetrics.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCardioMetric(k)}
                    aria-pressed={metric === k}
                    className={`min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors duration-200 ${metric === k ? 'bg-[#2A2A2E] text-chalk' : 'bg-surface2 text-chalkdim'}`}
                  >
                    {metricLabel[k]}
                  </button>
                ))}
              </div>
            )}

            {liftMetrics.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('stats.chartShows')}>
                {liftMetrics.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLiftMetric(k)}
                    aria-pressed={lift === k}
                    className={`min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors duration-200 ${lift === k ? 'bg-[#2A2A2E] text-chalk' : 'bg-surface2 text-chalkdim'}`}
                  >
                    {liftLabel[k]}
                  </button>
                ))}
              </div>
            )}

            {selectedProgress && selectedProgress.points.length > 0 ? (
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={selectedProgress.points}>
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis
                      {...AXIS}
                      width={36}
                      tickCount={4}
                      reversed={isCardioSel && metric === 'pace'}
                      tickFormatter={isCardioSel && metric === 'pace' ? formatPace : undefined}
                      domain={
                        isCardioSel
                          ? metric === 'duration'
                            ? [0, 'dataMax + 5']
                            : metric === 'pace'
                              ? [(min) => Math.max(0, Math.floor(min * 2 - 1) / 2), (max) => Math.ceil(max * 2 + 1) / 2]
                              : [0, 'auto']
                          : selectedProgress.bodyweight
                            ? [0, 'dataMax + 5']
                            : paddedDomain
                      }
                    />
                    <Tooltip
                      {...TOOLTIP}
                      cursor={{ stroke: GRID }}
                      formatter={(value, _name, item) => {
                        if (isCardioSel) {
                          if (metric === 'distance') return [`${formatDistance(value)} ${distUnit}`, metricLabel.distance]
                          if (metric === 'speed') return [`${formatSpeed(value)} ${distUnit === 'mi' ? 'mph' : 'km/h'}`, metricLabel.speed]
                          if (metric === 'pace') return [`${formatPace(value)} /${distUnit}`, metricLabel.pace]
                          if (metric === 'effort') return [Math.round(value * 10) / 10, metricLabel.effort]
                          return [`${formatDistance(value)} min`, t('stats.duration')]
                        }
                        if (selectedProgress.timed) return [formatSeconds(value, t('dashboard.secShort')), t('stats.longestHold')]
                        if (selectedProgress.bodyweight) return [`${value} reps`, t('stats.topSet')]
                        if (lift === 'e1rm') return [`${value}${selectedProgress.unit}`, t('stats.e1rmLabel')]
                        if (lift === 'volume') return [`${value.toLocaleString(dateLocale(lang))}${selectedProgress.unit}`, t('stats.volumeLabel')]
                        // Top weight: also say how many reps it was done for.
                        return [`${value}${selectedProgress.unit} × ${item?.payload?.reps}`, t('stats.topSet')]
                      }}
                    />
                    <Line
                      type="monotone"
                      connectNulls
                      dataKey={dataKey}
                      stroke={COLORS.chalkdim}
                      strokeWidth={2}
                      dot={(p) =>
                        p.index === selectedProgress.points.length - 1 ? (
                          <circle key={p.key} cx={p.cx} cy={p.cy} r={5} fill={ACCENT} />
                        ) : (
                          <circle key={p.key} cx={p.cx} cy={p.cy} r={2.5} fill={COLORS.chalkdim} />
                        )
                      }
                      activeDot={{ r: 5, fill: COLORS.chalk }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-chalkdim text-sm">{t('stats.pickToSee')}</p>
            )}
            {isLiftSel && lift === 'e1rm' && <p className="text-chalkdim text-xs">{t('stats.e1rmNote')}</p>}
            {selectedProgress?.category === 'cardio' && (
              <p className="text-chalkdim text-xs">{t('stats.cardioTrackingNote')}</p>
            )}
            {selectedProgress?.bodyweight && selectedProgress?.category !== 'cardio' && (
              <p className="text-chalkdim text-xs">
                {selectedProgress.timed ? t('stats.timedTrackingNote') : t('stats.bodyweightTrackingNote')}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-[17px] leading-[22px] flex items-center gap-1.5 flex-wrap">
              {t('stats.personalRecords')}
              <InfoTip text={t('stats.recordsTip')} />
            </h2>
            {records.length === 0 ? (
              <p className="text-chalkdim text-sm">{t('stats.noCompletedSets')}</p>
            ) : (
              <div className="flex flex-col">
                {records.map((r, i) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[58px] py-2.5 border-b border-white/[0.07] last:border-b-0">
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <p className="text-[15px] leading-5 font-medium truncate">{recordLabels[i]}</p>
                      <p className="text-chalkdim text-[13px] leading-[18px]">{shortDate(lang, r.date)}</p>
                    </div>
                    <p className="num text-base font-semibold text-end shrink-0">
                      {r.category === 'cardio'
                        ? `${r.duration} ${t('sessionCard.minUnit')} · ${r.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')} ${r.intensity}${
                            r.distance != null ? ` · ${r.distance}${r.unit}` : ''
                          }`
                        : r.timed
                          ? `${r.weight > 0 ? `+${r.weight}${r.unit} · ` : ''}${formatSeconds(r.reps, t('dashboard.secShort'))}`
                          : r.bodyweight
                            ? `${r.weight > 0 ? `+${r.weight}${r.unit} ` : ''}${t('sessionCard.bwShort')} × ${r.reps}`
                            : `${r.weight}${r.unit} × ${r.reps}`}
                    </p>
                    {r.category === 'cardio' && (r.farthest != null || r.bestPace != null) && (
                      <p className="num text-chalkdim text-[13px] basis-full">
                        {r.farthest != null && (
                          <>
                            {t('stats.farthest')} <bdi dir="ltr">{formatDistance(r.farthest)}{r.unit === 'mi' ? 'mi' : 'km'}</bdi>
                          </>
                        )}
                        {r.farthest != null && r.bestPace != null && ' · '}
                        {r.bestPace != null && (
                          <>
                            {t('stats.bestPace')} <bdi dir="ltr">{formatPace(r.bestPace)}/{r.unit === 'mi' ? 'mi' : 'km'}</bdi>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// Shared look for every chart axis: tabular chalkdim numbers, no ticks, no
// axis lines and no gridlines.
const AXIS = {
  stroke: CHALKDIM,
  tick: { fill: CHALKDIM, fontSize: 12 },
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
}
const TOOLTIP = {
  contentStyle: { background: '#1E1E21', border: 0, borderRadius: 12, fontSize: 13 },
  labelStyle: { color: CHALK },
  itemStyle: { color: CHALK },
}

// One neutral bar per week; the current week carries the accent.
function WeeklyChart({ title, caption, data, dataKey, yWidth, allowDecimals = true, note, tooltipFormatter }) {
  const last = data.length - 1
  return (
    <section className="bg-surface rounded-[22px] pt-[18px] px-[18px] pb-3.5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] leading-5">{title}</h2>
        <span className="text-[13px] text-chalkdim tabular-nums shrink-0">{caption}</span>
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="label" {...AXIS} ticks={[data[0].label, data[last].label]} interval={0} padding={{ left: 0, right: 0 }} />
            <YAxis {...AXIS} allowDecimals={allowDecimals} tickCount={3} width={yWidth} />
            <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={tooltipFormatter} />
            <Bar dataKey={dataKey} radius={[6, 6, 2, 2]} minPointSize={2}>
              {data.map((d, i) => (
                <Cell key={d.week} fill={i === last ? ACCENT : MUTED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <p className="text-chalkdim text-xs">{note}</p>}
    </section>
  )
}
