import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Scale } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useAdmin } from '../context/AdminContext.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import {
  useCollection,
  addBodyWeightEntry,
  updateBodyWeightEntry,
  deleteBodyWeightEntry,
} from '../lib/db.js'
import { Button, Card, EmptyState, LoadError, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import ProgressPhotos from './ProgressPhotos.jsx'
import { ACCENT, CHALK, CHALKDIM, MUTED, GRID, SURFACE } from '../theme.js'

const COLORS = { iron: ACCENT, chalk: CHALK, chalkdim: CHALKDIM, grid: GRID }

// If someone logs a few entries in kg and later switches to lb (or vice
// versa) — easy to do by accident since the unit is just a dropdown on
// each entry — raw subtraction/plotting across mixed units would produce
// a nonsensical "change" number and a chart line with a fake jump. Convert
// everything to one consistent unit for those calculations; each entry's
// own row still displays in whatever unit it was actually logged in.
const KG_PER_LB = 0.45359237
function toKg(weight, unit) {
  return unit === 'lb' ? weight * KG_PER_LB : weight
}
function fromKg(kg, unit) {
  return unit === 'lb' ? kg / KG_PER_LB : kg
}

function todayISO() {
  return toLocalISODate()
}

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}

function fullDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

// Built fresh each time so the date is today even when the app has been open
// since yesterday, and the unit follows the person's last entry.
const emptyForm = (unit = 'kg') => ({ date: todayISO(), weight: '', unit })

const RANGES = [
  { id: '1m', days: 30, key: 'bodyWeight.range1m' },
  { id: '3m', days: 90, key: 'bodyWeight.range3m' },
  { id: '1y', days: 365, key: 'bodyWeight.range1y' },
  { id: 'all', days: null, key: 'bodyWeight.rangeAll' },
]
const LIST_LIMIT = 20
const DAY_MS = 86400000
const dayNum = (iso) => Math.round(new Date(iso + 'T00:00:00').getTime() / DAY_MS)
const round1 = (n) => Math.round(n * 10) / 10

export default function BodyWeight() {
  const { effectiveUid, actingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [entries, loading, refresh, loadError] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'asc')
  const loadFailed = !!loadError && entries.length === 0
  const [form, setForm] = useState(() => emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [range, setRange] = useState('all')
  const [showAllEntries, setShowAllEntries] = useState(false)

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries])
  const latest = sorted[0]
  const first0 = [...entries].sort((a, b) => (a.date > b.date ? 1 : -1))[0]
  const displayUnit = latest?.unit || 'kg'

  // Once entries load, a blank new-entry form picks up the last unit used.
  useEffect(() => {
    if (!latest?.unit) return
    setForm((f) => (editingId || f.weight || f.unit === latest.unit ? f : { ...f, unit: latest.unit }))
  }, [latest?.unit, editingId])
  // 7-day moving average is computed over every entry (so the first points of
  // a short range are still averaged against the week before), then the range
  // only trims what's drawn.
  const fullData = useMemo(() => {
    const asc = [...entries]
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((e) => ({ ...e, day: dayNum(e.date), kg: toKg(e.weight, e.unit) }))
    return asc.map((e, i) => {
      let sum = 0
      let n = 0
      for (let j = i; j >= 0 && e.day - asc[j].day < 7; j--) { sum += asc[j].kg; n++ }
      return {
        ...e,
        label: shortDate(lang, e.date),
        weightDisplay: round1(fromKg(e.kg, displayUnit)),
        avg7: round1(fromKg(sum / n, displayUnit)),
      }
    })
  }, [entries, displayUnit, lang])
  const chartData = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days
    if (!days) return fullData
    const cutoff = dayNum(todayISO()) - days
    return fullData.filter((e) => e.day >= cutoff)
  }, [fullData, range])

  const first = fullData[0]
  // Change over the last 7 days: the latest entry against the newest one from a
  // week or more before it, or failing that the oldest one inside that week.
  const change7 = useMemo(() => {
    const last = fullData[fullData.length - 1]
    if (!last || fullData.length < 2) return null
    const before = [...fullData].reverse().find((e) => e.day <= last.day - 7)
    const ref = before || fullData.find((e) => e.day > last.day - 7 && e !== last)
    if (!ref) return null
    if (!before && last.day - ref.day < 1) return null
    return round1(fromKg(last.kg - ref.kg, displayUnit))
  }, [fullData, displayUnit])
  const signed = (n) => `${n > 0 ? '+' : ''}${n}${displayUnit}`
  const chartLabel =
    latest && change7 != null
      ? t('bodyWeight.chartAria', {
          latest: `${latest.weight} ${latest.unit}`,
          change: change7 === 0 ? t('bodyWeight.chgFlat') : t(change7 > 0 ? 'bodyWeight.chgUp' : 'bodyWeight.chgDown', { v: `${Math.abs(change7)} ${displayUnit}` }),
        })
      : t('bodyWeight.chartAriaNoChange', { latest: latest ? `${latest.weight} ${latest.unit}` : '' })
  const change =
    latest && first0 && latest.id !== first0.id
      ? Math.round(fromKg(toKg(latest.weight, latest.unit) - toKg(first0.weight, first0.unit), displayUnit) * 10) / 10
      : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.weight) return
    setSaving(true)
    try {
      if (editingId) {
        await updateBodyWeightEntry(effectiveUid, editingId, form)
      } else {
        await addBodyWeightEntry(effectiveUid, form)
      }
      refresh()
      setForm(emptyForm(form.unit))
      setEditingId(null)
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setForm({ date: entry.date, weight: String(entry.weight), unit: entry.unit })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm(displayUnit))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">{t('bodyWeight.body')}</div>
        <h1 className="text-3xl flex items-center gap-2 flex-wrap">
          {t('bodyWeight.title')}
          <InfoTip text={t('bodyWeight.pageTip')} />
        </h1>
      </div>

      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t('bodyWeight.current')} value={latest ? `${latest.weight}${latest.unit}` : '—'} />
          <Stat label={t('bodyWeight.firstLogged')} value={first ? `${first.weight}${first.unit}` : '—'} />
          <Stat label={t('bodyWeight.change')} value={change != null ? signed(change) : '—'} />
          <Stat label={t('bodyWeight.last7')} value={change7 != null ? signed(change7) : '—'} />
        </div>
      )}

      {!loading && entries.length > 1 && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="eyebrow">{t('bodyWeight.overTime')}</h2>
            <div role="group" aria-label={t('bodyWeight.rangeLabel')} className="flex rounded-md bg-surface2 p-1 text-sm w-fit">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  aria-pressed={range === r.id}
                  className={`px-3 min-h-11 rounded transition-colors ${range === r.id ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
                >
                  {t(r.key)}
                </button>
              ))}
            </div>
          </div>
          <div dir="ltr" role="img" aria-label={chartLabel}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" stroke={COLORS.chalkdim} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke={COLORS.chalkdim}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={['dataMin - 2', 'dataMax + 2']}
                />
                <Tooltip
                  contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: COLORS.chalk }}
                  formatter={(value, name) => [`${value}${displayUnit}`, name]}
                />
                <Line type="monotone" name={t('bodyWeight.weightTooltipLabel')} dataKey="weightDisplay" stroke={COLORS.iron} strokeWidth={2.5} dot={chartData.length > 60 ? false : { fill: COLORS.iron, r: 3 }} isAnimationActive={false} />
                <Line type="monotone" name={t('bodyWeight.avg7')} dataKey="avg7" stroke={COLORS.chalk} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-3 text-xs text-chalkdim">
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: COLORS.iron }} />{t('bodyWeight.weightTooltipLabel')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.chalk }} />{t('bodyWeight.avg7')}</span>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="eyebrow mb-3">{editingId ? t('bodyWeight.editEntry') : t('bodyWeight.logWeight')}</h2>
        <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
          <Field label={t('bodyWeight.date')}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label={t('bodyWeight.weightLabel')}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="0"
              className="w-24"
              required
            />
          </Field>
          <Field label={t('bodyWeight.unit')}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </Field>
          <Button type="submit" disabled={saving}>
            <Plus size={16} /> {editingId ? t('common.save') : t('common.add')}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              {t('common.cancel')}
            </Button>
          )}
        </form>
      </Card>

      {!loading && loadFailed && <LoadError onRetry={refresh} />}

      {!loading && !loadFailed && entries.length === 0 && (
        <EmptyState
          title={t('bodyWeight.emptyTitle')}
          body={t('bodyWeight.emptyBody')}
        />
      )}

      {sorted.length > 0 && (
        <Card className="flex flex-col divide-y divide-line">
          {(showAllEntries ? sorted : sorted.slice(0, LIST_LIMIT)).map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <Scale size={14} className="text-chalkdim" />
                <span className="text-chalkdim text-sm">{fullDate(lang, e.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-chalk">
                  {e.weight}
                  {e.unit}
                </span>
                <button onClick={() => startEdit(e)} aria-label={t('common.edit')} className="text-chalkdim hover:text-chalk inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    if (!(await confirm({ title: t('bodyWeight.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
                    try {
                      await deleteBodyWeightEntry(effectiveUid, e.id)
                      refresh()
                      toast(t('feedback.deleted'))
                    } catch {
                      toast(t('feedback.deleteFailed'), 'error')
                    }
                  }}
                  className="text-chalkdim hover:text-irontext inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {sorted.length > LIST_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllEntries((v) => !v)}
              className="min-h-11 pt-2.5 text-sm text-chalkdim hover:text-chalk"
            >
              {showAllEntries ? t('bodyWeight.showFewer') : t('bodyWeight.showAllEntries')(sorted.length)}
            </button>
          )}
        </Card>
      )}

      <Card>
        <h2 className="eyebrow mb-3">{t('photos.title')}</h2>
        <ProgressPhotos uid={effectiveUid} mode={actingAs ? 'coach' : 'own'} />
      </Card>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <Card className="flex flex-col items-center justify-center py-4 gap-1 text-center">
      <span className="num text-2xl text-chalk leading-none">{value}</span>
      <span className="text-chalkdim text-xs">{label}</span>
    </Card>
  )
}
