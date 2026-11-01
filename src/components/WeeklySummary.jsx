import React, { useMemo, useState } from 'react'
import { Copy, Download, Check, ArrowUp, ArrowDown, Minus, ChevronDown } from 'lucide-react'
import { BackChevron, ForwardChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { recordBaseline, entryPrKind } from '../lib/records.js'
import { useCollection } from '../lib/db.js'
import { sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { toLocalISODate, fmtDate, dateLocale, weekStartDate } from '../lib/dates.js'
import { Button, Card, CategoryTag, EmptyState, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { isWarmup, workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { cardioSummary, formatPace, formatDistance, toKm } from '../lib/cardio.js'


function startOfMonth(d) {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfMonth(d) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + 1, 0)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfYear(d) {
  const x = new Date(d)
  x.setMonth(0, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfYear(d) {
  const x = new Date(d)
  x.setMonth(11, 31)
  x.setHours(0, 0, 0, 0)
  return x
}

function toISO(d) {
  return toLocalISODate(d)
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRange(lang, start, end, mode) {
  if (mode === 'year') {
    return start.getFullYear() === end.getFullYear() ? String(start.getFullYear()) : `${start.getFullYear()}–${end.getFullYear()}`
  }
  if (mode === 'month') {
    return fmtDate(lang, start, { month: 'long', year: 'numeric' })
  }
  const opts = { month: 'short', day: 'numeric' }
  const startStr = fmtDate(lang, start, opts)
  const endStr = fmtDate(lang, end, { ...opts, year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function formatDay(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatSet(entry, s, t) {
  // Older entries can lack a unit — never print "undefined".
  const unit = entry.unit || ''
  if (entry.category === 'cardio') {
    const intensityLabel = entry.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')
    const dist = s.distance !== '' && s.distance != null ? ` · ${s.distance}${unit}` : ''
    const sd = Number(s.distance), sm = Number(s.duration)
    const pace = sd > 0 && sm > 0 ? `·${formatPace(sm / sd)}/${unit === 'mi' ? 'mi' : 'km'}` : ''
    return `${s.duration || 0}min·${intensityLabel}${s.intensity || 0}${dist}${pace}`
  }
  if (entry.timed) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${unit} ` : ''
    return `${added}${formatSeconds(s.reps) || '0s'}`
  }
  if (entry.bodyweight) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${unit} ` : ''
    return `${added}${t('sessionCard.bwShort')}×${s.reps || 0}`
  }
  return `${s.weight || 0}${unit}×${s.reps || 0}`
}

function getModes(t) {
  return [
    { id: 'week', label: t('summary.modeWeek') },
    { id: 'month', label: t('summary.modeMonth') },
    { id: 'year', label: t('summary.modeYear') },
    { id: 'custom', label: t('summary.modeCustom') },
  ]
}

function computeRange(mode, offset, customStart, customEnd) {
  const today = todayStart()

  if (mode === 'week') {
    const start = weekStartDate(today)
    start.setDate(start.getDate() + offset * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { start, end }
  }

  if (mode === 'month') {
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const start = startOfMonth(base)
    const end = offset === 0 ? today : endOfMonth(base)
    return { start, end }
  }

  if (mode === 'year') {
    const base = new Date(today.getFullYear() + offset, 0, 1)
    const start = startOfYear(base)
    const end = offset === 0 ? today : endOfYear(base)
    return { start, end }
  }

  const start = customStart ? new Date(customStart + 'T00:00:00') : today
  const end = customEnd ? new Date(customEnd + 'T00:00:00') : today
  return { start, end }
}

function computeTotals(sessions) {
  const totalSets = sessions.reduce((n, s) => n + (s.entries || []).reduce((m, e) => m + workingSets(e.sets).length, 0), 0)
  const totalVolume = sessions.reduce((sum, s) => {
    const v = (s.entries || []).reduce((eSum, e) => {
      if (e.category === 'cardio' || e.timed) return eSum
      return (
        eSum +
        workingSets(e.sets).reduce((sv, set) => {
          const w = Number(set.weight) || 0
          const r = Number(set.reps) || 0
          return sv + w * r
        }, 0)
      )
    }, 0)
    return sum + v
  }, 0)
  const totalCardioMinutes = sessions.reduce((sum, s) => {
    const m = (s.entries || []).reduce((eSum, e) => {
      if (e.category !== 'cardio') return eSum
      return eSum + (e.sets || []).reduce((sv, set) => sv + (Number(set.duration) || 0), 0)
    }, 0)
    return sum + m
  }, 0)

  const totalCardioKm = sessions.reduce((sum, s) => {
    return (
      sum +
      (s.entries || []).reduce((eSum, e) => {
        if (e.category !== 'cardio') return eSum
        const c = cardioSummary(e.sets)
        return c && c.distance != null ? eSum + toKm(c.distance, e.unit) : eSum
      }, 0)
    )
  }, 0)

  return { totalSets, totalVolume, totalCardioMinutes, totalCardioKm }
}

function buildSummary({ mode, start, end, sessions, bodyWeights, waists, personName, t, lang, exById }) {
  const lines = []
  const modeLabel = {
    week: t('summary.docWeekly'),
    month: t('summary.docMonthly'),
    year: t('summary.docYearly'),
    custom: t('summary.docCustomRange'),
  }[mode]
  lines.push(`# ${modeLabel} ${t('summary.docTrainingSummary')}`)
  lines.push(`${formatRange(lang, start, end, mode)}${personName ? ` — ${personName}` : ''}`)
  lines.push('')

  const { totalSets, totalVolume, totalCardioMinutes, totalCardioKm } = computeTotals(sessions)

  const parts = [
    `${sessions.length} ${sessions.length === 1 ? t('summary.docSession') : t('summary.docSessions')}`,
    `${totalSets} ${t('summary.docTotalSets')}`,
    `~${Math.round(totalVolume).toLocaleString(dateLocale(lang))} ${t('summary.docTotalVolume')}`,
  ]
  if (totalCardioMinutes > 0) parts.push(`${Math.round(totalCardioMinutes)} ${t('summary.docCardioMinutes')}`)
  if (totalCardioKm > 0) parts.push(`${formatDistance(totalCardioKm)} ${t('summary.docCardioDistance')}`)
  lines.push(parts.join(' · '))
  lines.push('')

  if (sessions.length === 0) {
    lines.push(t('summary.docNoSessions'))
  }

  for (const s of [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(`## ${formatDay(lang, s.date)} — ${sessionTitle(s, t)} (${s.category})`)
    for (const e of s.entries || []) {
      const setsStr = (e.sets || []).map((set) => (isWarmup(set) ? `${t('sessionCard.warmupShort')} ` : '') + formatSet(e, set, t)).join(', ')
      lines.push(`- ${entryName(e, exById, lang)}: ${setsStr || t('summary.docNoSetsLogged')}`)
      if (e.notes) lines.push(`  (${e.notes})`)
    }
    if (s.notes) lines.push(`  ${t('summary.docNotes')} ${s.notes}`)
    lines.push('')
  }

  if (bodyWeights.length > 0) {
    lines.push(`## ${t('summary.docBodyWeight')}`)
    for (const bw of [...bodyWeights].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      lines.push(`- ${formatDay(lang, bw.date)}: ${bw.weight}${bw.unit || ''}`)
    }
    lines.push('')
  }

  if (waists.length > 0) {
    lines.push(`## ${t('summary.docWaist')}`)
    for (const w of [...waists].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      lines.push(`- ${formatDay(lang, w.date)}: ${w.waist}${w.unit || ''}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function Chip({ value, label }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-md bg-surface2 px-2.5 py-1.5">
      <span className="num text-chalk text-sm font-medium">{value}</span>
      <span className="text-chalkdim text-xs">{label}</span>
    </span>
  )
}

// Personal records set inside [startISO, endISO]: one per exercise per
// session, judged against everything logged before that session (the same
// rule the workout screen uses), so a week's count never depends on later data.
function countPRs(allSessions, startISO, endISO) {
  const { personalBests: best, pastStrengthSets: past } = recordBaseline(allSessions.filter((s) => s.date < startISO))
  const inRange = allSessions
    .filter((s) => s.date >= startISO && s.date <= endISO)
    .sort((a, b) => (a.date === b.date ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.date < b.date ? -1 : 1))
  let n = 0
  for (const s of inRange) {
    for (const e of s.entries || []) {
      if (!e.exerciseId) continue
      if ((e.sets || []).some((set) => entryPrKind(e, set, best[e.exerciseId], past[e.exerciseId]))) n++
    }
    const base = recordBaseline([s])
    for (const [id, v] of Object.entries(base.personalBests)) if (best[id] == null || v > best[id]) best[id] = v
    for (const [id, list] of Object.entries(base.pastStrengthSets)) past[id] = (past[id] || []).concat(list)
  }
  return n
}

// Body-weight change across a period (last entry minus first), in the unit of
// the last entry; null with fewer than two weigh-ins.
function weightChange(bodyWeights) {
  if (bodyWeights.length < 2) return null
  const asc = [...bodyWeights].sort((a, b) => (a.date < b.date ? -1 : 1))
  const first = asc[0]
  const last = asc[asc.length - 1]
  const toKgW = (w) => (w.unit === 'lb' ? Number(w.weight) * 0.45359237 : Number(w.weight))
  const diffKg = toKgW(last) - toKgW(first)
  const unit = last.unit || 'kg'
  return { value: Math.round((unit === 'lb' ? diffKg / 0.45359237 : diffKg) * 10) / 10, unit }
}

// Neutral arrow + size of the move against the previous period. No red/green:
// more or less volume isn't good or bad by itself.
function Delta({ cur, prev, hasPrev, fmt, label, t }) {
  if (!hasPrev) return <span className="text-chalkdim text-xs">{t('summary.noCompare')}</span>
  const diff = Math.round((cur - prev) * 10) / 10
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus
  return (
    <span className="text-chalkdim text-xs leading-snug">
      <Icon size={12} aria-hidden="true" className="inline align-[-1px] me-1" />
      {diff === 0 ? t('summary.sameAsPrev') : <bdi dir="ltr" className="num">{fmt(Math.abs(diff))}</bdi>} {label}
    </span>
  )
}

function StatTile({ label, value, children, className = '' }) {
  return (
    <div className={`card p-3 flex flex-col gap-1 ${className}`}>
      <span className="text-chalkdim text-xs">{label}</span>
      <span className="num text-chalk text-2xl leading-none">
        <bdi dir="ltr">{value}</bdi>
      </span>
      {children}
    </div>
  )
}

// A header row that opens and closes the content under it.
function Collapsible({ title, meta, open, onToggle, children }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 min-h-11 rounded-md bg-surface2 px-3 text-start"
      >
        <span className="text-chalk text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2 text-chalkdim text-xs">
          {meta}
          <ChevronDown size={16} aria-hidden="true" className={open ? 'rotate-180' : ''} />
        </span>
      </button>
      {open && children}
    </div>
  )
}

function SessionCard({ s, t, lang, exById }) {
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="eyebrow">{formatDay(lang, s.date)}</div>
          <h3 className="text-lg leading-tight">
            <bdi dir="auto">{sessionTitle(s, t)}</bdi>
          </h3>
        </div>
        <CategoryTag category={s.category} />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {(s.entries || []).map((e, i) => (
          <li key={i} className="py-2 first:pt-0 last:pb-0">
            <div className="text-sm text-chalk">
              <bdi dir="auto">{entryName(e, exById, lang)}</bdi>
            </div>
            <div className="text-chalkdim text-sm num">
              {(e.sets || []).length === 0
                ? t('summary.docNoSetsLogged')
                : (e.sets || []).map((set, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && ', '}
                      <bdi dir="auto">{(isWarmup(set) ? `${t('sessionCard.warmupShort')} ` : '') + formatSet(e, set, t)}</bdi>
                    </React.Fragment>
                  ))}
            </div>
            {e.notes && (
              <div className="text-chalkdim text-xs italic mt-0.5">
                <bdi dir="auto">{e.notes}</bdi>
              </div>
            )}
          </li>
        ))}
      </ul>
      {s.notes && (
        <p className="text-chalkdim text-xs border-t border-line pt-2">
          {t('summary.docNotes')} <bdi dir="auto">{s.notes}</bdi>
        </p>
      )}
    </Card>
  )
}

// Dated measurements: body weight, or waist with field="waist".
function BodyWeightList({ list, lang, field = 'weight' }) {
  return (
    <Card className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-line">
        {[...list]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((bw) => (
            <li key={bw.id || bw.date} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <span className="text-chalkdim text-sm">{formatDay(lang, bw.date)}</span>
              <span className="num text-chalk text-sm">
                <bdi dir="ltr">
                  {bw[field]}
                  {bw.unit || ''}
                </bdi>
              </span>
            </li>
          ))}
      </ul>
    </Card>
  )
}

// Compact totals first (with the move against the previous period), the
// per-session detail behind a toggle. Year mode folds the detail by month so
// a whole year never renders at once. Mixed English/Hebrew fragments sit in
// <bdi> so they keep their own direction. buildSummary stays the source of the
// Copy/Download text.
function SummaryPreview({ mode, start, end, sessions, bodyWeights, waists, personName, t, lang, exById, prev, prCount, prevPrCount }) {
  const [showDetails, setShowDetails] = useState(false)
  const [openMonths, setOpenMonths] = useState({})
  const [bwOpen, setBwOpen] = useState(false)
  const [waistOpen, setWaistOpen] = useState(false)
  const modeLabel = {
    week: t('summary.docWeekly'),
    month: t('summary.docMonthly'),
    year: t('summary.docYearly'),
    custom: t('summary.docCustomRange'),
  }[mode]
  const { totalSets, totalVolume, totalCardioMinutes, totalCardioKm } = useMemo(() => computeTotals(sessions), [sessions])
  const num = (n) => Math.round(n).toLocaleString(dateLocale(lang))
  const vs = t({ week: 'summary.vsWeek', month: 'summary.vsMonth', year: 'summary.vsYear', custom: 'summary.vsPrev' }[mode])
  const hasPrev = prev.sessions > 0
  const bwChange = weightChange(bodyWeights)
  const bwPrev = prev.bwChange
  const sorted = useMemo(() => [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1)), [sessions])
  const months = useMemo(() => {
    const map = new Map()
    for (const s of sorted) {
      const k = s.date.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    return [...map.entries()]
  }, [sorted])
  const monthName = (k) => fmtDate(lang, new Date(k + '-01T00:00:00'), { month: 'long', year: mode === 'year' ? undefined : 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl">
          {modeLabel} {t('summary.docTrainingSummary')}
        </h2>
        <p className="text-chalkdim text-sm mt-0.5">
          {personName ? <bdi dir="auto">{personName}</bdi> : formatRange(lang, start, end, mode)}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label={t('summary.statSessions')} value={sessions.length}>
          <Delta cur={sessions.length} prev={prev.sessions} hasPrev={hasPrev} fmt={num} label={vs} t={t} />
        </StatTile>
        <StatTile label={t('summary.statVolume')} value={`~${num(totalVolume)}`}>
          <Delta cur={totalVolume} prev={prev.volume} hasPrev={hasPrev} fmt={num} label={vs} t={t} />
        </StatTile>
        <StatTile label={t('summary.statSets')} value={totalSets}>
          <Delta cur={totalSets} prev={prev.sets} hasPrev={hasPrev} fmt={num} label={vs} t={t} />
        </StatTile>
        <StatTile label={t('summary.statPRs')} value={prCount}>
          <Delta cur={prCount} prev={prevPrCount} hasPrev={hasPrev} fmt={num} label={vs} t={t} />
        </StatTile>
        {bwChange && (
          <StatTile label={t('summary.statBodyWeight')} value={`${bwChange.value > 0 ? '+' : ''}${bwChange.value}${bwChange.unit}`} className="col-span-2 sm:col-span-4">
            <Delta cur={bwChange.value} prev={bwPrev ?? 0} hasPrev={bwPrev != null} fmt={(n) => `${n}${bwChange.unit}`} label={vs} t={t} />
          </StatTile>
        )}
      </div>

      {(totalCardioMinutes > 0 || totalCardioKm > 0) && (
        <div className="flex flex-wrap gap-2">
          {totalCardioMinutes > 0 && <Chip value={num(totalCardioMinutes)} label={t('summary.docCardioMinutes')} />}
          {totalCardioKm > 0 && <Chip value={formatDistance(totalCardioKm)} label={t('summary.docCardioDistance')} />}
        </div>
      )}

      <Button variant="ghost" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} className="self-start">
        <ChevronDown size={15} aria-hidden="true" className={showDetails ? 'rotate-180' : ''} />
        {showDetails ? t('summary.hideDetails') : t('summary.showDetails')}
      </Button>

      {showDetails && mode === 'year' && (
        <>
          {months.map(([k, list]) => (
            <Collapsible
              key={k}
              title={monthName(k)}
              meta={list.length === 1 ? t('summary.monthSession') : t('summary.monthSessions', { n: list.length })}
              open={!!openMonths[k]}
              onToggle={() => setOpenMonths((o) => ({ ...o, [k]: !o[k] }))}
            >
              {list.map((s) => (
                <SessionCard key={s.id} s={s} t={t} lang={lang} exById={exById} />
              ))}
            </Collapsible>
          ))}
          {bodyWeights.length > 0 && (
            <Collapsible title={t('summary.docBodyWeight')} meta={<span className="num">{bodyWeights.length}</span>} open={bwOpen} onToggle={() => setBwOpen((v) => !v)}>
              <BodyWeightList list={bodyWeights} lang={lang} />
            </Collapsible>
          )}
          {waists.length > 0 && (
            <Collapsible title={t('summary.docWaist')} meta={<span className="num">{waists.length}</span>} open={waistOpen} onToggle={() => setWaistOpen((v) => !v)}>
              <BodyWeightList list={waists} lang={lang} field="waist" />
            </Collapsible>
          )}
        </>
      )}

      {showDetails && mode !== 'year' && (
        <>
          {sorted.map((s) => (
            <SessionCard key={s.id} s={s} t={t} lang={lang} exById={exById} />
          ))}
          {bodyWeights.length > 0 && (
            <>
              <h3 className="text-lg leading-tight">{t('summary.docBodyWeight')}</h3>
              <BodyWeightList list={bodyWeights} lang={lang} />
            </>
          )}
          {waists.length > 0 && (
            <>
              <h3 className="text-lg leading-tight">{t('summary.docWaist')}</h3>
              <BodyWeightList list={waists} lang={lang} field="waist" />
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function WeeklySummary() {
  const { effectiveUid, effectiveName, actingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const MODES = getModes(t)
  const [rawSessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [bodyWeightAll] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'desc')
  const [waistAll] = useCollection(effectiveUid, 'waist_logs', 'date', 'desc')
  const [exercises, exercisesLoading] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const sessions = useMemo(() => applyCurrentTimed(rawSessions, exercises), [rawSessions, exercises])
  const [routines, routinesLoading] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const exById = useMemo(() => exerciseMap(exercises), [exercises])

  const [mode, setMode] = useState('week')
  const [offset, setOffset] = useState(0)
  const [customStart, setCustomStart] = useState(toISO(weekStartDate(todayStart())))
  const [customEnd, setCustomEnd] = useState(toISO(todayStart()))
  const [copied, setCopied] = useState(false)

  function switchMode(next) {
    setMode(next)
    setOffset(0)
  }

  const { start, end, periodSessions, periodBodyWeights, periodWaists, prev, prCount, prevPrCount } = useMemo(() => {
    const { start, end } = computeRange(mode, offset, customStart, customEnd)
    const startISO = toISO(start)
    const endISO = toISO(end)
    // The previous period, cut to the same number of elapsed days so a week
    // or month still in progress isn't set against a full one.
    let pStart
    let pEnd
    const elapsed = Math.round((Math.min(end, todayStart()) - start) / 86400000)
    if (mode === 'custom') {
      const span = Math.round((end - start) / 86400000) + 1
      pEnd = new Date(start)
      pEnd.setDate(pEnd.getDate() - 1)
      pStart = new Date(pEnd)
      pStart.setDate(pStart.getDate() - (span - 1))
    } else {
      const full = computeRange(mode, offset - 1, customStart, customEnd)
      pStart = full.start
      pEnd = new Date(pStart)
      pEnd.setDate(pEnd.getDate() + Math.max(elapsed, 0))
      if (pEnd > full.end) pEnd = full.end
    }
    const pS = toISO(pStart)
    const pE = toISO(pEnd)
    const inRange = (d, a, b) => d >= a && d <= b
    const periodSessions = sessions.filter((s) => inRange(s.date, startISO, endISO))
    const prevSessions = sessions.filter((s) => inRange(s.date, pS, pE))
    const pt = computeTotals(prevSessions)
    return {
      start,
      end,
      periodSessions,
      periodBodyWeights: bodyWeightAll.filter((b) => inRange(b.date, startISO, endISO)),
      periodWaists: waistAll.filter((b) => inRange(b.date, startISO, endISO)),
      prev: {
        sessions: prevSessions.length,
        sets: pt.totalSets,
        volume: pt.totalVolume,
        bwChange: weightChange(bodyWeightAll.filter((b) => inRange(b.date, pS, pE)))?.value ?? null,
      },
      prCount: countPRs(sessions, startISO, endISO),
      prevPrCount: countPRs(sessions, pS, pE),
    }
  }, [sessions, bodyWeightAll, waistAll, mode, offset, customStart, customEnd])

  const summaryText = useMemo(
    () =>
      buildSummary({
        mode,
        start,
        end,
        sessions: periodSessions,
        bodyWeights: periodBodyWeights,
        waists: periodWaists,
        personName: actingAs ? effectiveName : null,
        t,
        lang,
        exById,
      }),
    [mode, start, end, periodSessions, periodBodyWeights, periodWaists, actingAs, effectiveName, t, lang, exById],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error(e)
      toast(t('summary.copyFailed'), 'error')
    }
  }

  function handleDownload() {
    const blob = new Blob([summaryText], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-summary-${toISO(start)}-to-${toISO(end)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFullBackup() {
    const backup = {
      exported_at: new Date().toISOString(),
      person: actingAs ? effectiveName : null,
      exercises,
      routines,
      sessions,
      body_weight_logs: bodyWeightAll,
      waist_logs: waistAll,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ironlog-backup-${toISO(todayStart())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">{t('summary.export')}</div>
        <h1 className="text-3xl">{t('summary.title')}</h1>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div role="group" aria-label={t('summary.periodGroup')} className="flex rounded-md bg-surface2 p-1 text-sm w-fit">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => switchMode(m.id)}
                className={`px-3 min-h-11 rounded transition-colors ${
                  mode === m.id ? 'bg-ink text-chalk' : 'text-chalkdim'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <InfoTip text={t('summary.periodTip')} />
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleCopy} disabled={loading}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('summary.copied') : t('summary.copy')}
          </Button>
          <Button variant="brass" onClick={handleDownload} disabled={loading}>
            <Download size={15} /> {t('summary.download')}
          </Button>
        </div>
      </div>

      {mode === 'custom' ? (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label={t('summary.from')}>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </Field>
          <Field label={t('summary.to')}>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            aria-label={t({ week: 'summary.prevWeek', month: 'summary.prevMonth', year: 'summary.prevYear' }[mode])}
            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk"
          >
            <BackChevron size={16} />
          </button>
          <span className="num text-sm w-44 text-center">{formatRange(lang, start, end, mode)}</span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            aria-label={t({ week: 'summary.nextWeek', month: 'summary.nextMonth', year: 'summary.nextYear' }[mode])}
            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk disabled:opacity-30"
          >
            <ForwardChevron size={16} />
          </button>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} className="text-chalkdim text-xs hover:text-chalk ms-1 min-h-11 px-2">
              {t('summary.backToCurrent')}
            </button>
          )}
        </div>
      )}

      {!loading && periodSessions.length === 0 ? (
        <EmptyState
          title={t('summary.emptyTitle')}
          body={t('summary.emptyBody')}
        />
      ) : (
        <SummaryPreview
          key={mode}
          mode={mode}
          start={start}
          end={end}
          sessions={periodSessions}
          bodyWeights={periodBodyWeights}
          waists={periodWaists}
          personName={actingAs ? effectiveName : null}
          t={t}
          lang={lang}
          exById={exById}
          prev={prev}
          prCount={prCount}
          prevPrCount={prevPrCount}
        />
      )}

      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-chalk">{t('summary.fullBackup')}</p>
          <p className="text-chalkdim text-xs mt-0.5">{t('summary.fullBackupBody')}</p>
        </div>
        <Button variant="ghost" onClick={handleFullBackup} disabled={loading || exercisesLoading || routinesLoading}>
          <Download size={15} /> {t('summary.downloadEverything')}
        </Button>
      </Card>
    </div>
  )
}
