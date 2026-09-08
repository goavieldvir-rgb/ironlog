import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Download, Check } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection } from '../lib/db.js'
import { Button, Card, EmptyState, Field } from './ui.jsx'

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
  return d.toISOString().slice(0, 10)
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRange(start, end, mode) {
  if (mode === 'year') {
    return start.getFullYear() === end.getFullYear() ? String(start.getFullYear()) : `${start.getFullYear()}–${end.getFullYear()}`
  }
  if (mode === 'month') {
    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  const opts = { month: 'short', day: 'numeric' }
  const startStr = start.toLocaleDateString(undefined, opts)
  const endStr = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function formatDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function formatSet(entry, s) {
  if (entry.category === 'cardio') {
    const intensityLabel = entry.intensityType === 'hr_zone' ? 'Zone' : 'RPE'
    const dist = s.distance !== '' && s.distance != null ? ` · ${s.distance}${entry.unit}` : ''
    return `${s.duration || 0}min·${intensityLabel}${s.intensity || 0}${dist}`
  }
  if (entry.bodyweight) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${entry.unit} ` : ''
    return `${added}BW×${s.reps || 0}`
  }
  return `${s.weight || 0}${entry.unit}×${s.reps || 0}`
}

const MODES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
]

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

function buildSummary({ mode, start, end, sessions, bodyWeights, personName }) {
  const lines = []
  const modeLabel = { week: 'Weekly', month: 'Monthly', year: 'Yearly', custom: 'Custom range' }[mode]
  lines.push(`# ${modeLabel} training summary`)
  lines.push(`${formatRange(start, end, mode)}${personName ? ` — ${personName}` : ''}`)
  lines.push('')

  const totalSets = sessions.reduce((n, s) => n + (s.entries || []).reduce((m, e) => m + (e.sets?.length || 0), 0), 0)
  const totalVolume = sessions.reduce((sum, s) => {
    const v = (s.entries || []).reduce((eSum, e) => {
      if (e.category === 'cardio') return eSum
      return (
        eSum +
        (e.sets || []).reduce((sv, set) => {
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

  const parts = [`${sessions.length} session${sessions.length === 1 ? '' : 's'}`, `${totalSets} total sets`, `~${Math.round(totalVolume).toLocaleString()} total volume`]
  if (totalCardioMinutes > 0) parts.push(`${Math.round(totalCardioMinutes)} cardio minutes`)
  lines.push(parts.join(' · '))
  lines.push('')

  if (sessions.length === 0) {
    lines.push('No sessions logged in this period.')
  }

  for (const s of [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(`## ${formatDay(s.date)} — ${s.routine_name} (${s.category})`)
    for (const e of s.entries || []) {
      const setsStr = (e.sets || []).map((set) => formatSet(e, set)).join(', ')
      lines.push(`- ${e.name}: ${setsStr || 'no sets logged'}`)
    }
    if (s.notes) lines.push(`  Notes: ${s.notes}`)
    lines.push('')
  }

  if (bodyWeights.length > 0) {
    lines.push('## Body weight')
    for (const bw of [...bodyWeights].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      lines.push(`- ${formatDay(bw.date)}: ${bw.weight}${bw.unit}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export default function WeeklySummary() {
  const { effectiveUid, effectiveName, actingAs } = useAdmin()
  const [sessions, loading] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [bodyWeightAll] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const [routines] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')

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
      }),
    [mode, start, end, periodSessions, periodBodyWeights, actingAs, effectiveName],
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
        <div className="eyebrow mb-1">Export</div>
        <h1 className="text-3xl">Training summary</h1>
      </div>

      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-chalk">Full backup</p>
          <p className="text-chalkdim text-xs mt-0.5">
            Every exercise, routine, session, and weigh-in — everything, not just this period.
          </p>
        </div>
        <Button variant="ghost" onClick={handleFullBackup}>
          <Download size={15} /> Download everything (.json)
        </Button>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => switchMode(m.id)}
              className={`px-3 py-1.5 rounded transition-colors ${
                mode === m.id ? 'bg-ink text-chalk' : 'text-chalkdim'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleCopy} disabled={loading}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="brass" onClick={handleDownload} disabled={loading}>
            <Download size={15} /> Download
          </Button>
        </div>
      </div>

      {mode === 'custom' ? (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="From">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="num text-sm w-44 text-center">{formatRange(start, end, mode)}</span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-chalkdim text-xs hover:text-chalk ml-1">
              Back to current
            </button>
          )}
        </div>
      )}

      {!loading && periodSessions.length === 0 ? (
        <EmptyState
          title="Nothing logged in this period"
          body="Once you log a session in this date range, it'll show up here as a shareable summary."
        />
      ) : (
        <Card>
          <pre className="whitespace-pre-wrap text-sm text-chalk font-mono leading-relaxed">{summaryText}</pre>
        </Card>
      )}
    </div>
  )
}
