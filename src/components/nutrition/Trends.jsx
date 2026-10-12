import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { dateLocale, fmtDate } from '../../lib/dates.js'
import { fmt } from '../../lib/nutrition.js'
import { getLogTotalsRange, kcalOnTarget, periodRange, periodStats, shiftDay, shiftPeriod } from '../../lib/nutritionStats.js'
import { getWaterGoal, getWaterLogs, litres } from '../../lib/water.js'
import { LoadError } from '../ui.jsx'
import { Backward, Forward, N, SheetHeader, ToneLabel, Track } from './parts.jsx'

// Week and month averages against the targets, as a view in the diary's
// sheet. Only finished days count (see nutritionStats.js).

const COLORS = { protein: '#D64545', kcal: '#C9A24B', good: '#4CAF7D', chalkdim: '#9CA0AA', grid: '#31353E' }

export default function Trends({ uid, today, targets, onBack, onClose }) {
  const { t, lang } = useLanguage()
  const [kind, setKind] = useState('week')
  // Opens on the period holding yesterday, the last finished day, so a
  // Monday (or the 1st) shows the week (or month) that just ended.
  const yesterday = shiftDay(today, -1)
  const [anchor, setAnchor] = useState(yesterday)
  const [metric, setMetric] = useState('kcal')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reloadN, setReloadN] = useState(0)
  const { from, to } = periodRange(kind, anchor)
  const current = periodRange(kind, today).from === from

  useEffect(() => {
    if (!uid) return
    let off = false
    setData(null)
    Promise.all([getLogTotalsRange(uid, from, to), getWaterLogs(uid, from, to).catch(() => []), getWaterGoal(uid).catch(() => null)])
      .then(([foodRows, waterRows, waterGoal]) => {
        if (off) return
        setData({ foodRows, waterRows, waterGoal })
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
  }, [uid, from, to, reloadN])

  const stats = useMemo(
    () => data && periodStats({ from, to, today, foodRows: data.foodRows, waterRows: data.waterRows, targets, waterGoal: data.waterGoal }),
    [data, from, to, today, targets],
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
                <Averages stats={stats} targets={targets} waterGoal={data.waterGoal} />
                <OnTarget stats={stats} targets={targets} waterGoal={data.waterGoal} />
              </>
            )}
            {stats.loggedDays > 0 && <DailyChart stats={stats} kind={kind} targets={targets} metric={metric} setMetric={setMetric} />}
            <p className="text-chalkdim text-xs">{t('nutrition.averagesNote')}</p>
          </>
        )}
      </div>
    </>
  )
}

function Averages({ stats, targets, waterGoal }) {
  const { t } = useLanguage()
  const g = t('nutrition.g')
  const k = t('nutrition.kcalUnit')
  const { avg } = stats
  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="eyebrow">{t('nutrition.dailyAverage')}</h3>
        <span className="text-chalkdim text-xs whitespace-nowrap">{t('nutrition.daysLogged', { n: stats.loggedDays, total: stats.finishedDays })}</span>
      </div>

      <AvgRow tone="protein" label={t('nutrition.protein')} value={avg.protein} target={targets?.protein} unit={g} big />
      <AvgRow tone="kcal" label={t('nutrition.calories')} value={avg.kcal} target={targets?.kcal} unit={k} />

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

function AvgRow({ tone, label, value, target, unit, big = false, digits = 0 }) {
  const { t } = useLanguage()
  return (
    <div className={big ? '' : 'border-t border-line pt-4'}>
      <ToneLabel tone={tone}>{label}</ToneLabel>
      <div className="flex items-baseline gap-2 mt-1">
        <N mono className={`${big ? 'text-3xl' : 'text-xl'} leading-none`}>{fmt(value, digits)}</N>
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

function OnTarget({ stats, targets, waterGoal }) {
  const { t } = useLanguage()
  const rows = [
    ['protein', t('nutrition.protein'), t('nutrition.ruleProtein'), stats.proteinHits, stats.loggedDays],
    ['kcal', t('nutrition.calories'), t('nutrition.ruleKcal'), stats.kcalHits, stats.loggedDays],
  ]
  if (stats.waterDays > 0) rows.push(['water', t('water.title'), t('nutrition.ruleWater'), waterGoal ? stats.waterHits : null, stats.waterDays])
  return (
    <div className="card p-4 flex flex-col gap-3">
      <h3 className="eyebrow">{t('nutrition.daysOnTarget')}</h3>
      {rows.map(([tone, label, rule, hits, total]) => (
        <div key={tone} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <ToneLabel tone={tone} plain>
              <span className="text-chalk text-sm">{label}</span>
            </ToneLabel>
            <p className="text-chalkdim text-xs mt-0.5">{hits == null ? t('nutrition.noTargetSet') : rule}</p>
          </div>
          {hits != null && (
            <span className={`text-sm whitespace-nowrap shrink-0 ${hits === total ? 'text-good' : 'text-chalkdim'}`}>
              {t('nutrition.hitsOf', { n: hits, total })}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function DailyChart({ stats, kind, targets, metric, setMetric }) {
  const { t, lang } = useLanguage()
  const target = metric === 'kcal' ? targets?.kcal : targets?.protein
  const isHit = (day) => (metric === 'kcal' ? kcalOnTarget(day.kcal, target) : target > 0 && day.protein >= target)
  const rows = stats.days.map((day) => {
    const date = new Date(day.date + 'T00:00:00')
    return {
      label: kind === 'week' ? date.toLocaleDateString(dateLocale(lang), { weekday: 'short' }) : String(date.getDate()),
      value: day.finished && day.n > 0 ? Math.round(day[metric]) : null,
      hit: day.finished && day.n > 0 && isHit(day),
    }
  })
  const unit = metric === 'kcal' ? t('nutrition.kcalUnit') : t('nutrition.g')
  return (
    <div className="card p-4 flex flex-col gap-3">
      <h3 className="eyebrow">{t('nutrition.perDay')}</h3>
      <div className="flex gap-1.5" role="group" aria-label={t('nutrition.chartShows')}>
        {[
          ['kcal', t('nutrition.calories')],
          ['protein', t('nutrition.protein')],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMetric(k)}
            aria-pressed={metric === k}
            className={`min-h-[44px] px-3 rounded-md border text-sm ${metric === k ? 'border-brass text-brass bg-brasssoft' : 'border-line text-chalkdim hover:text-chalk'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} interval={kind === 'week' ? 0 : 'preserveStartEnd'} minTickGap={8} />
            <YAxis stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
              labelStyle={{ color: '#EDEDE6' }}
              formatter={(v) => [`${v} ${unit}`, metric === 'kcal' ? t('nutrition.calories') : t('nutrition.protein')]}
            />
            {target > 0 && <ReferenceLine y={target} stroke={COLORS.chalkdim} strokeDasharray="4 4" ifOverflow="extendDomain" />}
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.hit ? COLORS.good : COLORS[metric]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {target > 0 && (
        <p className="text-chalkdim text-xs flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-good shrink-0" aria-hidden="true" />
          {metric === 'kcal' ? t('nutrition.legendKcal') : t('nutrition.legendProtein')}
        </p>
      )}
    </div>
  )
}
