import React, { useMemo, useState } from 'react'
import { Copy, Download, Check } from 'lucide-react'
import { BackChevron, ForwardChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection } from '../lib/db.js'
import { toLocalISODate, fmtDate, dateLocale } from '../lib/dates.js'
import { Button, Card, CategoryTag, EmptyState, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { isWarmup, workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { cardioSummary, formatPace, formatDistance, toKm } from '../lib/cardio.js'

function mondayOf(d) {
  const date = new Date(d)
  const day = date.getDay() === 0 ? 6 : date.getDay() - 1
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

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
    const start = mondayOf(today)
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

function buildSummary({ mode, start, end, sessions, bodyWeights, personName, t, lang }) {
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
    lines.push(`## ${formatDay(lang, s.date)} — ${s.routine_name} (${s.category})`)
    for (const e of s.entries || []) {
      const setsStr = (e.sets || []).map((set) => (isWarmup(set) ? `${t('sessionCard.warmupShort')} ` : '') + formatSet(e, set, t)).join(', ')
      lines.push(`- ${e.name}: ${setsStr || t('summary.docNoSetsLogged')}`)
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

// On-screen version of the export, built from the same data and helpers as
// buildSummary (which stays the source of the Copy/Download text). Mixed
// English/Hebrew fragments sit in <bdi> so they keep their own direction.
function SummaryPreview({ mode, start, end, sessions, bodyWeights, personName, t, lang }) {
  const modeLabel = {
    week: t('summary.docWeekly'),
    month: t('summary.docMonthly'),
    year: t('summary.docYearly'),
    custom: t('summary.docCustomRange'),
  }[mode]
  const { totalSets, totalVolume, totalCardioMinutes, totalCardioKm } = computeTotals(sessions)
  const num = (n) => Math.round(n).toLocaleString(dateLocale(lang))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl">
          {modeLabel} {t('summary.docTrainingSummary')}
        </h2>
        <p className="text-chalkdim text-sm mt-0.5">
          {formatRange(lang, start, end, mode)}
          {personName && (
            <>
              {' — '}
              <bdi dir="auto">{personName}</bdi>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip value={sessions.length} label={sessions.length === 1 ? t('summary.docSession') : t('summary.docSessions')} />
        <Chip value={totalSets} label={t('summary.docTotalSets')} />
        <Chip value={`~${num(totalVolume)}`} label={t('summary.docTotalVolume')} />
        {totalCardioMinutes > 0 && <Chip value={num(totalCardioMinutes)} label={t('summary.docCardioMinutes')} />}
        {totalCardioKm > 0 && <Chip value={formatDistance(totalCardioKm)} label={t('summary.docCardioDistance')} />}
      </div>

      {[...sessions]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((s) => (
          <Card key={s.id} className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="eyebrow">{formatDay(lang, s.date)}</div>
                <h3 className="text-lg leading-tight">
                  <bdi dir="auto">{s.routine_name}</bdi>
                </h3>
              </div>
              <CategoryTag category={s.category} />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {(s.entries || []).map((e, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <div className="text-sm text-chalk">
                    <bdi dir="auto">{e.name}</bdi>
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
        ))}

      {bodyWeights.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-lg leading-tight">{t('summary.docBodyWeight')}</h3>
          <ul className="flex flex-col divide-y divide-line">
            {[...bodyWeights]
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((bw) => (
                <li key={bw.id || bw.date} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="text-chalkdim text-sm">{formatDay(lang, bw.date)}</span>
                  <span className="num text-chalk text-sm">
                    <bdi dir="ltr">
                      {bw.weight}
                      {bw.unit || ''}
                    </bdi>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export default function WeeklySummary() {
  const { effectiveUid, effectiveName, actingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const MODES = getModes(t)
  const [rawSessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [bodyWeightAll] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'desc')
  const [exercises, exercisesLoading] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const sessions = useMemo(() => applyCurrentTimed(rawSessions, exercises), [rawSessions, exercises])
  const [routines, routinesLoading] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')

  const [mode, setMode] = useState('week')
  const [offset, setOffset] = useState(0)
  const [customStart, setCustomStart] = useState(toISO(mondayOf(todayStart())))
  const [customEnd, setCustomEnd] = useState(toISO(todayStart()))
  const [copied, setCopied] = useState(false)

  function switchMode(next) {
    setMode(next)
    setOffset(0)
  }

  const { start, end, periodSessions, periodBodyWeights } = useMemo(() => {
    const { start, end } = computeRange(mode, offset, customStart, customEnd)
    const startISO = toISO(start)
    const endISO = toISO(end)
    return {
      start,
      end,
      periodSessions: sessions.filter((s) => s.date >= startISO && s.date <= endISO),
      periodBodyWeights: bodyWeightAll.filter((b) => b.date >= startISO && b.date <= endISO),
    }
  }, [sessions, bodyWeightAll, mode, offset, customStart, customEnd])

  const summaryText = useMemo(
    () =>
      buildSummary({
        mode,
        start,
        end,
        sessions: periodSessions,
        bodyWeights: periodBodyWeights,
        personName: actingAs ? effectiveName : null,
        t,
        lang,
      }),
    [mode, start, end, periodSessions, periodBodyWeights, actingAs, effectiveName, t, lang],
  )

  async function handleCopy() {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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

      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-chalk">{t('summary.fullBackup')}</p>
          <p className="text-chalkdim text-xs mt-0.5">{t('summary.fullBackupBody')}</p>
        </div>
        <Button variant="ghost" onClick={handleFullBackup} disabled={loading || exercisesLoading || routinesLoading}>
          <Download size={15} /> {t('summary.downloadEverything')}
        </Button>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit">
            {MODES.map((m) => (
              <button
                key={m.id}
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
            onClick={() => setOffset((o) => o - 1)}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk"
          >
            <BackChevron size={16} />
          </button>
          <span className="num text-sm w-44 text-center">{formatRange(lang, start, end, mode)}</span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk disabled:opacity-30"
          >
            <ForwardChevron size={16} />
          </button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-chalkdim text-xs hover:text-chalk ms-1">
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
          mode={mode}
          start={start}
          end={end}
          sessions={periodSessions}
          bodyWeights={periodBodyWeights}
          personName={actingAs ? effectiveName : null}
          t={t}
          lang={lang}
        />
      )}
    </div>
  )
}
