import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { dateLocale, fmtDate } from '../../lib/dates.js'
import { CHART, axisProps, tooltipProps } from '../../lib/chartTheme.js'
import { fmt } from '../../lib/nutrition.js'
import { getLogTotalsRange, kcalOnTarget, periodRange, periodStats, shiftDay, shiftPeriod } from '../../lib/nutritionStats.js'
import { getWaterGoal, getWaterLogs, litres } from '../../lib/water.js'
import { LoadError } from '../ui.jsx'
import { Backward, Forward, N, SheetHeader, ToneLabel, Track } from './parts.jsx'

// Week and month averages against the targets, as a view in the diary's
// sheet. Only finished days count (see nutritionStats.js).

const BAR = { protein: CHART.iron, kcal: CHART.brass, water: CHART.cardio }

export default function Trends({ uid, today, targets, onBack, onClose }) {
  const { t, lang } = useLanguage()
  const [kind, setKind] = useState('week')
  // Opens on the period holding yesterday, the last finished day, so a
  // Sunday (or the 1st) shows the week (or month) that just ended.
  const yesterday = shiftDay(today, -1)
  const [anchor, setAnchor] = useState(yesterday)
  const [metric, setMetric] = useState('kcal')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reloadN, setReloadN] = useState(0)
  const { from, to } = periodRange(kind, anchor)
  const current = periodRange(kind, today).from === from
  const prev = periodRange(kind, shiftPeriod(kind, from, -1))

  useEffect(() => {
    if (!uid) return
    let off = false
    setData(null)
    // The period before comes along for the "vs the week before" line; if it
    // fails, the comparison is just left out.
    Promise.all([
      getLogTotalsRange(uid, from, to),
      getWaterLogs(uid, from, to).catch(() => []),
      getWaterGoal(uid).catch(() => null),
      getLogTotalsRange(uid, prev.from, prev.to).catch(() => null),
    ])
      .then(([foodRows, waterRows, waterGoal, prevRows]) => {
        if (off) return
        setData({ foodRows, waterRows, waterGoal, prevRows })
        setError(null)
      })
      .catch((err) => {
        if (off) return
        console.error(err)
        setError(err)
      })
    return () => {
      off = true
    }
  }, [uid, from, to, prev.from, prev.to, reloadN])

  const stats = useMemo(
    () => data && periodStats({ from, to, today, foodRows: data.foodRows, waterRows: data.waterRows, targets, waterGoal: data.waterGoal }),
    [data, from, to, today, targets],
  )
  const prevStats = useMemo(
    () => data?.prevRows && periodStats({ from: prev.from, to: prev.to, today, foodRows: data.prevRows, waterRows: [], targets, waterGoal: null }),
    [data, prev.from, prev.to, today, targets],
  )

  const d = (iso, opts) => fmtDate(lang, new Date(iso + 'T00:00:00'), opts)
  const prevFrom = periodRange(kind, shiftPeriod(kind, periodRange(kind, today).from, -1)).from
  const relative = current ? t(kind === 'week' ? 'nutrition.thisWeek' : 'nutrition.thisMonth') : from === prevFrom ? t(kind === 'week' ? 'nutrition.lastWeek' : 'nutrition.lastMonth') : null
  const rangeLabel = kind === 'month' ? d(from, { month: 'long', year: 'numeric' }) : `${d(from, { day: 'numeric', month: 'short' })} – ${d(to, { day: 'numeric', month: 'short' })}`

  function pickKind(k) {
    setKind(k)
    setAnchor(yesterday)
  }

  return (
    <>
      <SheetHeader title={t('nutrition.averages')} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] flex flex-col gap-4">
        <div role="radiogroup" aria-label={t('nutrition.period')} className="grid grid-cols-2 gap-1 p-1 mt-2 rounded-lg bg-ink border border-line">
          {['week', 'month'].map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => pickKind(k)}
              className={`min-h-[40px] rounded-md text-sm font-medium press transition-colors ${kind === k ? 'bg-surface2 text-chalk' : 'text-chalkdim hover:text-chalk'}`}
            >
              {t(k === 'week' ? 'nutrition.week' : 'nutrition.month')}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setAnchor(shiftPeriod(kind, from, -1))} aria-label={t('nutrition.prevPeriod')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 press shrink-0">
            <Backward size={22} />
          </button>
          <div className="text-center min-w-0">
            {relative && <div className="eyebrow">{relative}</div>}
            <div className="text-lg truncate">
              <bdi>{rangeLabel}</bdi>
            </div>
          </div>
          <button type="button" disabled={current} onClick={() => setAnchor(shiftPeriod(kind, from, 1))} aria-label={t('nutrition.nextPeriod')} className="w-11 h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 press shrink-0 disabled:opacity-30 disabled:pointer-events-none">
            <Forward size={22} />
          </button>
        </div>

        {error && <LoadError onRetry={() => setReloadN((n) => n + 1)} />}
        {!error && !stats && <p className="eyebrow animate-pulse">{t('common.loading')}</p>}
        {stats && (
          <>
            {stats.loggedDays === 0 ? (
              <div className="card p-4">
                <p className="text-sm text-chalkdim">{t('nutrition.noFinishedDays')}</p>
              </div>
            ) : (
              <>
                <Averages stats={stats} prevStats={prevStats} kind={kind} targets={targets} waterGoal={data.waterGoal} />
                <DailyChart stats={stats} kind={kind} targets={targets} waterGoal={data.waterGoal} metric={metric} setMetric={setMetric} />
                <OnTarget stats={stats} kind={kind} targets={targets} waterGoal={data.waterGoal} />
              </>
            )}
            <p className="text-chalkdim text-xs">{t('nutrition.averagesNote')}</p>
          </>
        )}
      </div>
    </>
  )
}

function Averages({ stats, prevStats, kind, targets, waterGoal }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const { avg } = stats
  // Compared only when the period before has a finished day with food.
  const before = prevStats?.loggedDays > 0 ? prevStats.avg : null
  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="eyebrow">{t('nutrition.dailyAverage')}</h3>
        <span className="text-chalkdim text-xs whitespace-nowrap">{t('nutrition.daysLogged', { n: stats.loggedDays, total: stats.finishedDays })}</span>
      </div>

      <AvgRow tone="protein" label={t('nutrition.protein')} value={avg.protein} target={targets?.protein} unit={g} delta={before && avg.protein - before.protein} kind={kind} big />
      <AvgRow tone="kcal" label={t('nutrition.calories')} value={avg.kcal} target={targets?.kcal} unit={k} delta={before && avg.kcal - before.kcal} kind={kind} />

      <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
        {[
          ['carbs', t('nutrition.carbs'), avg.carbs, targets?.carbs],
          ['fat', t('nutrition.fat'), avg.fat, targets?.fat],
        ].map(([tone, label, v, target]) => (
          <div key={tone}>
            <div className="flex items-baseline justify-between gap-2">
              <ToneLabel tone={tone}>{label}</ToneLabel>
              <span className="text-chalkdim text-sm whitespace-nowrap">
                <N mono className="text-chalk">{fmt(v, 0)}</N>
                {target != null && (
                  <>
                    {' / '}
                    <N mono>{fmt(target, 0)}</N>
                  </>
                )}{' '}
                {g}
              </span>
            </div>
            {target > 0 && (
              <div className="mt-2">
                <Track value={v} max={target} size="sm" tone={tone} />
              </div>
            )}
          </div>
        ))}
      </div>

      {stats.waterDays > 0 && (
        <AvgRow tone="water" label={t('water.title')} value={Number(litres(stats.waterAvg))} target={waterGoal ? Number(litres(waterGoal)) : null} unit={t('water.litres')} digits={1} />
      )}
    </div>
  )
}

function AvgRow({ tone, label, value, target, unit, delta = null, kind, big = false, digits = 0 }) {
  const { t } = useLanguage()
  return (
    <div className={big ? '' : 'border-t border-line pt-4'}>
      <div className="flex items-center justify-between gap-2">
        <ToneLabel tone={tone}>{label}</ToneLabel>
        {delta != null && <Delta value={delta} unit={unit} kind={kind} />}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <N mono className={`${big ? 'text-4xl' : 'text-2xl'} leading-none`}>{fmt(value, digits)}</N>
        <span className="text-chalkdim text-sm whitespace-nowrap">
          {target != null ? (
            <>
              {t('nutrition.of')} <N mono>{fmt(target, digits)}</N> {unit}
            </>
          ) : (
            unit
          )}
        </span>
      </div>
      {target > 0 && (
        <div className={big ? 'mt-3' : 'mt-2.5'}>
          <Track value={value} max={target} tone={tone} />
        </div>
      )}
    </div>
  )
}

// "+6 g vs the week before". Neutral grey either way: more calories can be
// the plan as easily as fewer.
function Delta({ value, unit, kind }) {
  const { t } = useLanguage()
  const r = Math.round(value)
  const Icon = r > 0 ? ArrowUp : ArrowDown
  return (
    <span className="text-chalkdim text-xs whitespace-nowrap inline-flex items-center gap-1">
      {r === 0 ? (
        t(kind === 'week' ? 'nutrition.sameAsWeekBefore' : 'nutrition.sameAsMonthBefore')
      ) : (
        <>
          <Icon size={12} aria-hidden="true" className="shrink-0" />
          <span>
            <N mono className="text-chalk">
              {r > 0 ? '+' : '−'}
              {fmt(Math.abs(r), 0)}
            </N>{' '}
            {unit} {t(kind === 'week' ? 'nutrition.vsWeekBefore' : 'nutrition.vsMonthBefore')}
          </span>
        </>
      )}
    </span>
  )
}

function DailyChart({ stats, kind, targets, waterGoal, metric, setMetric }) {
  const { t, lang } = useLanguage()
  const metrics = [
    ['kcal', t('nutrition.calories')],
    ['protein', t('nutrition.protein')],
  ]
  if (stats.waterDays > 0) metrics.push(['water', t('water.title')])
  const m = metrics.some(([k]) => k === metric) ? metric : 'kcal'
  const water = m === 'water'
  const target = m === 'kcal' ? targets?.kcal : m === 'protein' ? targets?.protein : waterGoal ? waterGoal / 1000 : null
  const digits = water ? 1 : 0
  const unit = m === 'kcal' ? t('nutrition.kcalUnit') : water ? t('water.litres') : t('nutrition.g')
  const rows = stats.days.map((day) => {
    const date = new Date(day.date + 'T00:00:00')
    const has = day.finished && (water ? day.wn > 0 : day.n > 0)
    const value = has ? (water ? Math.round(day.ml / 100) / 10 : Math.round(day[m])) : null
    return {
      label: kind === 'week' ? date.toLocaleDateString(dateLocale(lang), { weekday: 'short' }) : String(date.getDate()),
      value,
      hit: has && target > 0 && (m === 'kcal' ? kcalOnTarget(day.kcal, target) : water ? day.ml >= waterGoal : day.protein >= target),
    }
  })
  const week = kind === 'week'
  return (
    <div className="card p-4 flex flex-col gap-3">
      <h3 className="eyebrow">{t('nutrition.perDay')}</h3>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('nutrition.chartShows')}>
        {metrics.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMetric(k)}
            aria-pressed={m === k}
            className={`min-h-[44px] px-3 rounded-md border text-sm press ${m === k ? 'border-brass text-brass bg-brasssoft' : 'border-line text-chalkdim hover:text-chalk'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={week ? 200 : 180}>
          <BarChart data={rows} margin={{ top: week ? 20 : 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" {...axisProps} interval={week ? 0 : 'preserveStartEnd'} minTickGap={8} />
            {/* No y scale: the dashed target line is the reference, and in a
                week each bar carries its own number. */}
            <YAxis hide domain={[0, (max) => Math.max(max, target || 0) * 1.08]} />
            <Tooltip {...tooltipProps} formatter={(v) => [`${fmt(v, digits)} ${unit}`, metrics.find(([k]) => k === m)[1]]} />
            {target > 0 && <ReferenceLine y={target} stroke={CHART.chalkdim} strokeDasharray="4 4" />}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.hit ? CHART.good : BAR[m]} />
              ))}
              {week && <LabelList dataKey="value" position="top" fill={CHART.chalkdim} fontSize={11} fontFamily='"IBM Plex Mono", monospace' formatter={(v) => (v == null ? '' : fmt(v, digits))} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {target > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-chalkdim text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-good shrink-0" aria-hidden="true" />
            {m === 'kcal' ? t('nutrition.legendKcal') : t('nutrition.legendProtein')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-chalkdim shrink-0" aria-hidden="true" />
            {t('nutrition.targetLine')} <N mono>{fmt(target, digits)}</N> {unit}
          </span>
        </div>
      )}
    </div>
  )
}

// One cell per day of the period, so a streak or a bad stretch shows at a
// glance. Laid out left to right like the chart above it.
function OnTarget({ stats, kind, targets, waterGoal }) {
  const { t, lang } = useLanguage()
  const tp = targets?.protein
  const tk = targets?.kcal
  const rows = [
    { tone: 'protein', label: t('nutrition.protein'), rule: t('nutrition.ruleProtein'), hits: stats.proteinHits, total: stats.loggedDays, has: (d) => d.n > 0, hit: (d) => d.protein >= tp },
    { tone: 'kcal', label: t('nutrition.calories'), rule: t('nutrition.ruleKcal'), hits: stats.kcalHits, total: stats.loggedDays, has: (d) => d.n > 0, hit: (d) => kcalOnTarget(d.kcal, tk) },
  ]
  if (stats.waterDays > 0)
    rows.push({ tone: 'water', label: t('water.title'), rule: t('nutrition.ruleWater'), hits: waterGoal ? stats.waterHits : null, total: stats.waterDays, has: (d) => d.wn > 0, hit: (d) => d.ml >= waterGoal })
  const week = kind === 'week'
  const gap = week ? 'gap-1.5' : 'gap-[3px]'
  return (
    <div className="card p-4 flex flex-col gap-4">
      <h3 className="eyebrow">{t('nutrition.daysOnTarget')}</h3>
      {rows.map((r) => (
        <div key={r.tone} className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <ToneLabel tone={r.tone} plain>
                <span className="text-chalk text-sm">{r.label}</span>
              </ToneLabel>
              <p className="text-chalkdim text-xs mt-0.5">{r.hits == null ? t('nutrition.noTargetSet') : r.rule}</p>
            </div>
            {r.hits != null && (
              <span className="text-sm whitespace-nowrap shrink-0 text-chalkdim">
                <N mono className={r.hits === r.total ? 'text-good' : 'text-chalk'}>
                  {r.hits}
                </N>{' '}
                {t('nutrition.hitsOfShort', { total: r.total })}
              </span>
            )}
          </div>
          {r.hits != null && (
            <div dir="ltr" className={`flex ${gap}`} aria-hidden="true">
              {stats.days.map((d) => (
                <span
                  key={d.date}
                  className={`flex-1 h-3 rounded-[3px] ${!d.finished ? 'border border-dashed border-line' : !r.has(d) ? 'border border-line' : r.hit(d) ? 'bg-good' : 'bg-chalkdim/35'}`}
                />
              ))}
            </div>
          )}
        </div>
      ))}
      {week && (
        <div dir="ltr" className={`flex ${gap} -mt-2`} aria-hidden="true">
          {stats.days.map((d) => (
            <span key={d.date} className="flex-1 text-center text-[11px] text-chalkdim">
              {new Date(d.date + 'T00:00:00').toLocaleDateString(dateLocale(lang), { weekday: 'narrow' })}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-chalkdim text-xs border-t border-line pt-3">
        {[
          ['bg-good', t('nutrition.legendHit')],
          ['bg-chalkdim/35', t('nutrition.legendMissed')],
          ['border border-line', t('nutrition.legendNotLogged')],
        ].map(([cls, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-[3px] shrink-0 ${cls}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
