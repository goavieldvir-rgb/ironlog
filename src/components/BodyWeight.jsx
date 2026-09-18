import React, { useMemo, useState } from 'react'
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
import { toLocalISODate } from '../lib/dates.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  useCollection,
  addBodyWeightEntry,
  updateBodyWeightEntry,
  deleteBodyWeightEntry,
} from '../lib/db.js'
import { Button, Card, EmptyState, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'

const COLORS = { iron: '#D64545', chalk: '#EDEDE6', chalkdim: '#9CA0AA', grid: '#31353E' }

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

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const emptyForm = { date: todayISO(), weight: '', unit: 'kg' }

export default function BodyWeight() {
  const { effectiveUid } = useAdmin()
  const { t } = useLanguage()
  const [entries, loading, refresh] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'asc')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries])
  const latest = sorted[0]
  const first0 = [...entries].sort((a, b) => (a.date > b.date ? 1 : -1))[0]
  const displayUnit = latest?.unit || 'kg'
  const chartData = useMemo(
    () =>
      [...entries]
        .sort((a, b) => (a.date > b.date ? 1 : -1))
        .map((e) => ({ ...e, label: shortDate(e.date), weightDisplay: Math.round(fromKg(toKg(e.weight, e.unit), displayUnit) * 10) / 10 })),
    [entries, displayUnit],
  )

  const first = chartData[0]
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
      setForm(emptyForm)
      setEditingId(null)
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
    setForm(emptyForm)
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
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('bodyWeight.current')} value={latest ? `${latest.weight}${latest.unit}` : '—'} />
          <Stat label={t('bodyWeight.firstLogged')} value={first ? `${first.weight}${first.unit}` : '—'} />
          <Stat label={t('bodyWeight.change')} value={change != null ? `${change > 0 ? '+' : ''}${change}${displayUnit}` : '—'} />
        </div>
      )}

      {!loading && entries.length > 1 && (
        <Card>
          <h2 className="eyebrow mb-4">{t('bodyWeight.overTime')}</h2>
          <div dir="ltr">
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
                  contentStyle={{ background: '#1C1F26', border: '1px solid #31353E', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: COLORS.chalk }}
                  formatter={(value) => [`${value}${displayUnit}`, t('bodyWeight.weightTooltipLabel')]}
                />
                <Line type="monotone" dataKey="weightDisplay" stroke={COLORS.iron} strokeWidth={2.5} dot={{ fill: COLORS.iron, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
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

      {!loading && entries.length === 0 && (
        <EmptyState
          title={t('bodyWeight.emptyTitle')}
          body={t('bodyWeight.emptyBody')}
        />
      )}

      {sorted.length > 0 && (
        <Card className="flex flex-col divide-y divide-line">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <Scale size={14} className="text-chalkdim" />
                <span className="text-chalkdim text-sm">{fullDate(e.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-chalk">
                  {e.weight}
                  {e.unit}
                </span>
                <button onClick={() => startEdit(e)} className="text-chalkdim hover:text-chalk p-1">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('bodyWeight.deleteConfirm'))) deleteBodyWeightEntry(effectiveUid, e.id).then(refresh)
                  }}
                  className="text-chalkdim hover:text-iron p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
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
