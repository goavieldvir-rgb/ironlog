import React, { useMemo, useState } from 'react'
import { Flame, TrendingUp, Trophy, BarChart3, Heart } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from 'recharts'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import ExerciseSelect from './ExerciseSelect.jsx'
import { useCollection } from '../lib/db.js'
import { entryName, exerciseMap } from '../lib/names.js'
import { toLocalISODate, fmtDate, dateLocale, weekStartOf } from '../lib/dates.js'
import { disambiguateLabels } from '../lib/disambiguate.js'
import { Card, EmptyState, LoadError, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { cardioSummary, formatPace, formatSpeed, formatDistance, toKm } from '../lib/cardio.js'
import { CHART, axisProps, tooltipProps } from '../lib/chartTheme.js'


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
  const [exerciseId, setExerciseId] = useState('')
  const [cardioMetric, setCardioMetric] = useState('duration')
  const [cardioWeekly, setCardioWeekly] = useState('min')

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
  const totalCardioKm = useMemo(() => weeklyData.reduce((s, w) => s + w.cardioKm, 0), [weeklyData])
  const hasCardio = useMemo(
    () => totalCardioMinutes > 0 || sessions.some((s) => (s.entries || []).some((e) => e.category === 'cardio')),
    [totalCardioMinutes, sessions],
  )

  // Personal records + per-exercise progress history, derived straight from
  // the sets people logged (no need for a separate exercises fetch).
  const { records, exerciseOptions, progressByExercise } = useMemo(() => {
    const exById = exerciseMap(exercises)
    const recMap = {}
    const progMap = {}

    for (const s of sessions) {
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
        progMap[entry.exerciseId].points.push({
          date: s.date,
          label: shortDate(lang, s.date),
          weight: Number(topSet.weight) || 0,
          reps: Number(topSet.reps),
        })
      }
    }

    const records = Object.entries(recMap)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const exerciseOptions = Object.entries(progMap).map(([id, p]) => ({ id, name: p.name, category: p.category, unit: p.unit, bodyweight: p.bodyweight, timed: p.timed, intensityType: p.intensityType }))
    exerciseOptions.sort((a, b) => a.name.localeCompare(b.name))

    // Sessions come back newest-first (needed elsewhere), but a progress
    // line chart only makes sense read oldest-to-newest, left to right.
    // Without this, the most recent point would plot on the left and the
    // oldest on the right — backwards.
    for (const key of Object.keys(progMap)) {
      progMap[key].points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    }

    return { records, exerciseOptions, progressByExercise: progMap }
  }, [sessions, exercises, lang])

  // If two exercises share a name (possible now that tracking method can
  // differ between "variants" of the same movement), append a short
  // disambiguating suffix — "(kg)" vs "(lb)", "(Bodyweight)", "(RPE)" vs
  // "(HR Zone)" — so the dropdown and PR list never show two identical
  // entries with no way to tell them apart.
  const recordLabels = useMemo(() => disambiguateLabels(records, (r) => r.name, t), [records, t])
  const exerciseOptionLabels = useMemo(() => disambiguateLabels(exerciseOptions, (e) => e.name, t), [exerciseOptions, t])

  const selectedProgress = exerciseId ? progressByExercise[exerciseId] : null

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
  const progressKey = isCardioSel ? metric : selectedProgress?.bodyweight ? 'reps' : 'weight'
  // [value as text, what it is], for the tooltip and the latest/first line.
  const progressValue = (value) => {
    if (isCardioSel) {
      if (metric === 'distance') return [`${formatDistance(value)} ${distUnit}`, metricLabel.distance]
      if (metric === 'speed') return [`${formatSpeed(value)} ${distUnit === 'mi' ? 'mph' : 'km/h'}`, metricLabel.speed]
      if (metric === 'pace') return [`${formatPace(value)} /${distUnit}`, metricLabel.pace]
      if (metric === 'effort') return [Math.round(value * 10) / 10, metricLabel.effort]
      return [`${formatDistance(value)} min`, t('stats.duration')]
    }
    if (selectedProgress.timed) return [formatSeconds(value), t('stats.longestHold')]
    if (selectedProgress.bodyweight) return [`${value} reps`, t('stats.topSet')]
    return [`${value}${selectedProgress.unit}`, t('stats.topSet')]
  }
  const plotted = selectedProgress ? selectedProgress.points.filter((p) => p[progressKey] != null) : []
  const latest = plotted[plotted.length - 1]
  const firstPoint = plotted.length > 1 ? plotted[0] : null
  const lineColor = isCardioSel ? CHART.cardio : CHART.iron
  const loadFailed = !!loadError && rawSessions.length === 0
  const hasData = !loading && sessions.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">{t('stats.insights')}</div>
        <h1 className="text-3xl">{t('stats.title')}</h1>
      </div>

      {!loading && loadFailed && <LoadError onRetry={refreshSessions} />}

      {!loading && !loadFailed && sessions.length === 0 && (
        <EmptyState
          title={t('stats.emptyTitle')}
          body={t('stats.emptyBody')}
        />
      )}

      {hasData && (
        <>
          <Summary
            items={[
              [Flame, t('stats.weekStreak'), streak],
              [BarChart3, t('stats.sessionsLogged'), sessions.length],
              [TrendingUp, t('stats.totalVolume'), totalVolume.toLocaleString(dateLocale(lang))],
              hasCardio && [Heart, t('stats.cardioMinutes'), totalCardioMinutes.toLocaleString(dateLocale(lang))],
              totalCardioKm > 0 && [Heart, t('stats.cardioDistance'), formatDistance(totalCardioKm)],
              [Trophy, t('stats.personalRecords'), records.length],
            ].filter(Boolean)}
          />

          <WeeklyChart title={t('stats.sessionsPerWeek')} data={weeklyData} dataKey="sessions" color={CHART.iron} />
          <WeeklyChart title={t('stats.volumePerWeek')} data={weeklyData} dataKey="volume" color={CHART.brass} note={t('stats.volumeNote')} />
          {hasCardio && (
            // Minutes and distance share one card, so the page stays a thumb's
            // scroll shorter.
            <WeeklyChart
              title={cardioWeekly === 'km' && totalCardioKm > 0 ? t('stats.cardioDistancePerWeek') : t('stats.cardioPerWeek')}
              data={weeklyData}
              color={CHART.cardio}
              {...(cardioWeekly === 'km' && totalCardioKm > 0 ? { dataKey: 'cardioKm', unit: 'km', digits: 1 } : { dataKey: 'cardioMinutes', unit: t('sessionCard.minUnit') })}
              toggle={
                totalCardioKm > 0 && (
                  <div className="flex gap-1.5 mt-3" role="group" aria-label={t('stats.chartShows')}>
                    {[
                      ['min', t('stats.metricTime')],
                      ['km', t('stats.metricDistance')],
                    ].map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCardioWeekly(k)}
                        aria-pressed={cardioWeekly === k}
                        className={`min-h-[44px] px-3 rounded-md border text-sm press ${cardioWeekly === k ? 'border-brass text-brass bg-brasssoft' : 'border-line text-chalkdim hover:text-chalk'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )
              }
            />
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

            {cardioMetrics.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('stats.chartShows')}>
                {cardioMetrics.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCardioMetric(k)}
                    aria-pressed={metric === k}
                    className={`min-h-[44px] px-3 rounded-md border text-sm press ${metric === k ? 'border-brass text-brass bg-brasssoft' : 'border-line text-chalkdim hover:text-chalk'}`}
                  >
                    {metricLabel[k]}
                  </button>
                ))}
              </div>
            )}

            {latest && (
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-chalkdim text-xs">
                    {progressValue(latest[progressKey])[1]} · {shortDate(lang, latest.date)}
                  </p>
                  <p className="num text-3xl text-chalk leading-none mt-1.5">
                    <bdi dir="ltr">{progressValue(latest[progressKey])[0]}</bdi>
                  </p>
                </div>
                {firstPoint && (
                  <p className="text-chalkdim text-xs text-end">
                    {t('stats.firstLogged')}{' '}
                    <bdi dir="ltr" className="num text-chalk">
                      {progressValue(firstPoint[progressKey])[0]}
                    </bdi>{' '}
                    · {shortDate(lang, firstPoint.date)}
                  </p>
                )}
              </div>
            )}

            {selectedProgress && selectedProgress.points.length > 0 ? (
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={selectedProgress.points}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.line} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={12} />
                    <YAxis
                      {...axisProps}
                      width={36}
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
                            : ['dataMin - 5', 'dataMax + 5']
                      }
                    />
                    <Tooltip
                      {...tooltipProps}
                      cursor={{ stroke: CHART.line }}
                      formatter={progressValue}
                    />
                    <Line
                      type="monotone"
                      connectNulls
                      dataKey={progressKey}
                      stroke={lineColor}
                      strokeWidth={2.5}
                      dot={{ fill: lineColor, stroke: CHART.surface, strokeWidth: 2, r: 4 }}
                      activeDot={{ fill: lineColor, stroke: CHART.chalk, strokeWidth: 2, r: 5 }}
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
                {selectedProgress.timed ? t('stats.timedTrackingNote') : t('stats.bodyweightTrackingNote')}
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
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2.5">
                    <p className="truncate min-w-0">{recordLabels[i]}</p>
                    <div className="text-end shrink-0">
                      <p className="num text-chalk">
                        {r.category === 'cardio'
                          ? `${r.duration} ${t('sessionCard.minUnit')} · ${r.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')} ${r.intensity}${
                              r.distance != null ? ` · ${r.distance}${r.unit}` : ''
                            }`
                          : r.timed
                            ? `${r.weight > 0 ? `+${r.weight}${r.unit} · ` : ''}${formatSeconds(r.reps)}`
                          : r.bodyweight
                            ? `${r.weight > 0 ? `+${r.weight}${r.unit} ` : ''}${t('sessionCard.bwShort')} × ${r.reps}`
                            : `${r.weight}${r.unit} × ${r.reps}`}
                      </p>
                      <p className="text-chalkdim text-xs">{shortDate(lang, r.date)}</p>
                    </div>
                    {r.category === 'cardio' && (r.farthest != null || r.bestPace != null) && (
                      <p className="num text-chalkdim text-xs basis-full">
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
          </Card>
        </>
      )}
    </div>
  )
}

// The headline numbers as one panel, split by hairlines rather than a grid
// of separate boxes.
function Summary({ items }) {
  const odd = items.length % 2 === 1
  return (
    <div className={`grid grid-cols-2 ${['', '', '', 'sm:grid-cols-3', 'sm:grid-cols-4', 'sm:grid-cols-5', 'sm:grid-cols-6'][items.length]} gap-px bg-line border border-line rounded-xl overflow-hidden`}>
      {items.map(([Icon, label, value], i) => (
        <div key={label} className={`bg-surface px-4 py-4 flex flex-col gap-2.5 min-w-0 ${odd && i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}>
          <span className="flex items-center gap-1.5 text-chalkdim text-xs min-w-0">
            <Icon size={14} className="text-brass shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </span>
          <span className="num text-3xl text-chalk leading-none">{value}</span>
        </div>
      ))}
    </div>
  )
}

// A 12-week bar chart that leads with this week's number and the weekly
// average. This week's bar is solid; earlier weeks are a shade dimmer.
function WeeklyChart({ title, data, dataKey, color, unit = '', digits = 0, note, toggle }) {
  const { t, lang } = useLanguage()
  const fmtN = (v) => Number(v).toLocaleString(dateLocale(lang), { maximumFractionDigits: digits })
  const compact = (v) => Number(v).toLocaleString(dateLocale(lang), { notation: 'compact', maximumFractionDigits: 1 })
  const now = data[data.length - 1]?.[dataKey] ?? 0
  const avg = data.reduce((s, w) => s + w[dataKey], 0) / (data.length || 1)
  const last = data.length - 1
  return (
    <Card>
      <h2 className="eyebrow">{title}</h2>
      {toggle}
      <div className="flex items-end justify-between gap-3 mt-3 mb-4">
        <div className="min-w-0">
          <span className="num text-3xl text-chalk leading-none">
            <bdi dir="ltr">{fmtN(now)}</bdi>
          </span>
          <span className="text-chalkdim text-sm ms-1.5">
            {unit && `${unit} `}
            {t('stats.thisWeek')}
          </span>
        </div>
        <div className="text-end shrink-0">
          <div className="num text-chalk text-sm">
            <bdi dir="ltr">{fmtN(Math.round(avg * 10 ** digits) / 10 ** digits)}</bdi>
          </div>
          <div className="text-chalkdim text-xs inline-flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-chalkdim shrink-0" aria-hidden="true" />
            {t('stats.weeklyAverage')}
          </div>
        </div>
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={34} allowDecimals={digits > 0} tickCount={4} tickFormatter={compact} />
            <Tooltip {...tooltipProps} formatter={(v) => [`${fmtN(v)}${unit ? ` ${unit}` : ''}`, title]} />
            {avg > 0 && <ReferenceLine y={avg} stroke={CHART.chalkdim} strokeDasharray="4 4" />}
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((w, i) => (
                <Cell key={w.week} fill={color} fillOpacity={i === last ? 1 : 0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <p className="text-chalkdim text-xs mt-3">{note}</p>}
    </Card>
  )
}
