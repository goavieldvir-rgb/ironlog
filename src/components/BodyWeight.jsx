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
import {
  useCollection,
  addBodyWeightEntry,
  updateBodyWeightEntry,
  deleteBodyWeightEntry,
} from '../lib/db.js'
import { Button, Card, EmptyState, Field } from './ui.jsx'

const COLORS = { iron: '#D64545', chalk: '#EDEDE6', chalkdim: '#9CA0AA', grid: '#31353E' }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
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
  const [entries, loading, refresh] = useCollection(effectiveUid, 'body_weight_logs', 'date', 'asc')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries])
  const chartData = useMemo(
    () => [...entries].sort((a, b) => (a.date > b.date ? 1 : -1)).map((e) => ({ ...e, label: shortDate(e.date) })),
    [entries],
  )

  const latest = sorted[0]
  const first = chartData[0]
  const change = latest && first && latest.id !== first.id ? Math.round((latest.weight - first.weight) * 10) / 10 : null

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
        <div className="eyebrow mb-1">Body</div>
        <h1 className="text-3xl">Weight tracking</h1>
      </div>

      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Current" value={latest ? `${latest.weight}${latest.unit}` : '—'} />
          <Stat label="First logged" value={first ? `${first.weight}${first.unit}` : '—'} />
          <Stat label="Change" value={change != null ? `${change > 0 ? '+' : ''}${change}${latest.unit}` : '—'} />
        </div>
      )}

      {!loading && entries.length > 1 && (
        <Card>
          <h2 className="eyebrow mb-4">Over time</h2>
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
                formatter={(value, _name, item) => [`${value}${item.payload.unit}`, 'Weight']}
              />
              <Line type="monotone" dataKey="weight" stroke={COLORS.iron} strokeWidth={2.5} dot={{ fill: COLORS.iron, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <h2 className="eyebrow mb-3">{editingId ? 'Edit entry' : 'Log weight'}</h2>
        <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
          <Field label="Date">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Weight">
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
          <Field label="Unit">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </Field>
          <Button type="submit" disabled={saving}>
            <Plus size={16} /> {editingId ? 'Save' : 'Add'}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
        </form>
      </Card>

      {!loading && entries.length === 0 && (
        <EmptyState
          title="No weigh-ins logged yet"
          body="Log your weight above whenever you check in — daily, weekly, whatever works for you. A chart and simple stats will build up here over time."
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
                    if (confirm('Delete this entry?')) deleteBodyWeightEntry(effectiveUid, e.id).then(refresh)
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
