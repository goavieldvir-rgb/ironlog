import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Ruler } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, addWaistEntry, updateWaistEntry, deleteWaistEntry } from '../lib/db.js'
import { Button, Card, EmptyState, LoadError, Field } from './ui.jsx'
import { ACCENT, CHALK, CHALKDIM, GRID, SURFACE } from '../theme.js'

// Same idea as kg/lb on the weight page: entries can be logged in either
// unit, so convert to one unit before subtracting or plotting.
const CM_PER_IN = 2.54
function toCm(waist, unit) {
  return unit === 'in' ? waist * CM_PER_IN : waist
}
function fromCm(cm, unit) {
  return unit === 'in' ? cm / CM_PER_IN : cm
}
const round1 = (n) => Math.round(n * 10) / 10

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}

function fullDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

const makeEmptyForm = () => ({ date: toLocalISODate(), waist: '', unit: 'cm' })

export default function WaistTracker({ uid }) {
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [entries, loading, refresh, loadError] = useCollection(uid, 'waist_logs', 'date', 'asc')
  const loadFailed = !!loadError && entries.length === 0
  const [form, setForm] = useState(makeEmptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries])
  const latest = sorted[0]
  const first = sorted[sorted.length - 1]
  const displayUnit = latest?.unit || 'cm'
  const chartData = useMemo(
    () =>
      [...entries]
        .sort((a, b) => (a.date > b.date ? 1 : -1))
        .map((e) => ({ ...e, label: shortDate(lang, e.date), waistDisplay: round1(fromCm(toCm(e.waist, e.unit), displayUnit)) })),
    [entries, displayUnit, lang],
  )
  const change =
    latest && first && latest.id !== first.id
      ? round1(fromCm(toCm(latest.waist, latest.unit) - toCm(first.waist, first.unit), displayUnit))
      : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.waist) return
    setSaving(true)
    try {
      if (editingId) {
        await updateWaistEntry(uid, editingId, form)
      } else {
        await addWaistEntry(uid, form)
      }
      refresh()
      setForm(makeEmptyForm())
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
    setForm({ date: entry.date, waist: String(entry.waist), unit: entry.unit })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(makeEmptyForm())
  }

  return (
    <section className="flex flex-col gap-6" aria-label={t('waist.title')}>
      <div>
        <h2 className="text-2xl">{t('waist.title')}</h2>
        <p className="text-chalkdim text-sm mt-1">{t('waist.hint')}</p>
      </div>

      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('waist.current')} value={latest ? `${latest.waist}${latest.unit}` : '—'} />
          <Stat label={t('waist.firstLogged')} value={first ? `${first.waist}${first.unit}` : '—'} />
          <Stat label={t('waist.change')} value={change != null ? `${change > 0 ? '+' : ''}${change}${displayUnit}` : '—'} />
        </div>
      )}

      {!loading && entries.length > 1 && (
        <Card>
          <h3 className="eyebrow mb-4">{t('waist.overTime')}</h3>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" stroke={CHALKDIM} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={CHALKDIM} fontSize={12} tickLine={false} axisLine={false} width={40} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: CHALK }}
                  formatter={(value) => [`${value}${displayUnit}`, t('waist.tooltipLabel')]}
                />
                <Line type="monotone" dataKey="waistDisplay" stroke={ACCENT} strokeWidth={2.5} dot={{ fill: ACCENT, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="eyebrow mb-3">{editingId ? t('waist.editEntry') : t('waist.logWaist')}</h3>
        <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
          <Field label={t('waist.date')}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label={t('waist.waistLabel')}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={form.waist}
              onChange={(e) => setForm({ ...form, waist: e.target.value })}
              placeholder="0"
              className="w-24"
              required
            />
          </Field>
          <Field label={t('waist.unit')}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="cm">cm</option>
              <option value="in">in</option>
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
        <EmptyState title={t('waist.emptyTitle')} body={t('waist.emptyBody')} />
      )}

      {sorted.length > 0 && (
        <Card className="flex flex-col divide-y divide-line">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <Ruler size={14} className="text-chalkdim" />
                <span className="text-chalkdim text-sm">{fullDate(lang, e.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-chalk">
                  {e.waist}
                  {e.unit}
                </span>
                <button onClick={() => startEdit(e)} aria-label={t('common.edit')} className="text-chalkdim hover:text-chalk inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    if (!(await confirm({ title: t('waist.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
                    try {
                      await deleteWaistEntry(uid, e.id)
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
        </Card>
      )}
    </section>
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
