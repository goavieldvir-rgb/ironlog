import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Download, Check } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useCollection } from '../lib/db.js'
import { Button, Card, EmptyState } from './ui.jsx'

function mondayOf(d) {
  const date = new Date(d)
  const day = date.getDay() === 0 ? 6 : date.getDay() - 1
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

function toISO(d) {
  return d.toISOString().slice(0, 10)
}

function formatRange(start, end) {
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
  if (entry.bodyweight) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${entry.unit} ` : ''
    return `${added}BW×${s.reps || 0}`
  }
  return `${s.weight || 0}${entry.unit}×${s.reps || 0}`
}

function buildSummary({ weekStart, weekEnd, sessions, bodyWeights, personName }) {
  const lines = []
  lines.push(`# Weekly training summary`)
  lines.push(`${formatRange(weekStart, weekEnd)}${personName ? ` — ${personName}` : ''}`)
  lines.push('')

  const totalSets = sessions.reduce((n, s) => n + (s.entries || []).reduce((m, e) => m + (e.sets?.length || 0), 0), 0)
  const totalVolume = sessions.reduce((sum, s) => {
    const v = (s.entries || []).reduce(
      (eSum, e) =>
        eSum +
        (e.sets || []).reduce((sv, set) => {
          const w = Number(set.weight) || 0
          const r = Number(set.reps) || 0
          return sv + w * r
        }, 0),
      0,
    )
    return sum + v
  }, 0)

  lines.push(`${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${totalSets} total sets · ~${Math.round(totalVolume).toLocaleString()} total volume`)
  lines.push('')

  if (sessions.length === 0) {
    lines.push('No sessions logged this week.')
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
  const [weekOffset, setWeekOffset] = useState(0)
  const [copied, setCopied] = useState(false)

  const { weekStart, weekEnd, weekSessions, weekBodyWeights } = useMemo(() => {
    const base = mondayOf(new Date())
    base.setDate(base.getDate() + weekOffset * 7)
    const end = new Date(base)
    end.setDate(end.getDate() + 6)
    const startISO = toISO(base)
    const endISO = toISO(end)
    return {
      weekStart: base,
      weekEnd: end,
      weekSessions: sessions.filter((s) => s.date >= startISO && s.date <= endISO),
      weekBodyWeights: bodyWeightAll.filter((b) => b.date >= startISO && b.date <= endISO),
    }
  }, [sessions, bodyWeightAll, weekOffset])

  const summaryText = useMemo(
    () =>
      buildSummary({
        weekStart,
        weekEnd,
        sessions: weekSessions,
        bodyWeights: weekBodyWeights,
        personName: actingAs ? effectiveName : null,
      }),
    [weekStart, weekEnd, weekSessions, weekBodyWeights, actingAs, effectiveName],
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
    a.download = `training-summary-${toISO(weekStart)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">Export</div>
        <h1 className="text-3xl">Weekly summary</h1>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="num text-sm w-40 text-center">{formatRange(weekStart, weekEnd)}</span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            className="p-2 rounded-md hover:bg-surface2 text-chalkdim hover:text-chalk disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-chalkdim text-xs hover:text-chalk ml-1">
              This week
            </button>
          )}
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

      {!loading && weekSessions.length === 0 ? (
        <EmptyState title="Nothing logged this week" body="Once you log a session in this date range, it'll show up here as a shareable summary." />
      ) : (
        <Card>
          <pre className="whitespace-pre-wrap text-sm text-chalk font-mono leading-relaxed">{summaryText}</pre>
        </Card>
      )}
    </div>
  )
}
