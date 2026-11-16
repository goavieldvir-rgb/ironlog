import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Ruler } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import {
  useMeasurementSetup,
  fetchMeasurements,
  addMeasurement,
  updateMeasurement,
  deleteMeasurement,
  measurementLabel,
  typeFor,
  unitsFor,
  convert,
  round1,
} from '../lib/measurements.js'
import { Button, Card, EmptyState, Field, LoadError } from './ui.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { accentNow, CHALK, CHALKDIM, GRID, SURFACE } from '../theme.js'

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}
function fullDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}
const fmt = (v, unit) => `${v}${unit || ''}`

// Body measurements on the body page. The coach picks which ones a person
// logs; with only waist on (the default) this looks exactly like the old
// waist card. Anything logged before keeps showing even if the coach has
// since turned it off, so no history disappears.
export default function MeasurementTracker({ uid }) {
  useAdmin() // redraw in the coach's color once it loads
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [setup] = useMeasurementSetup(uid)
  const [entries, setEntries] = useState(null)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState(null)
  const [date, setDate] = useState(toLocalISODate)
  const [values, setValues] = useState({})
  const [lengthUnit, setLengthUnit] = useState('cm')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    fetchMeasurements(uid)
      .then((list) => !cancelled && (setEntries(list), setLoadFailed(false)))
      .catch((e) => {
        console.error(e)
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [uid, reload])

  const types = setup?.types || []
  const enabled = useMemo(() => (setup?.kinds || ['waist']).filter((k) => typeFor(k, types) && !typeFor(k, types).archived), [setup, types])
  // Shown: what's on, then anything else that has entries.
  const shown = useMemo(() => {
    const logged = [...new Set((entries || []).map((e) => e.kind))].filter((k) => typeFor(k, types) && !enabled.includes(k))
    return [...enabled, ...logged]
  }, [enabled, entries, types])
  const kind = shown.includes(selected) ? selected : shown[0]
  const onlyWaist = shown.length === 1 && shown[0] === 'waist'

  // Start the unit picker on whatever lengths were last logged in.
  useEffect(() => {
    const lastLen = [...(entries || [])].reverse().find((e) => e.unit === 'cm' || e.unit === 'in')
    if (lastLen) setLengthUnit(lastLen.unit)
  }, [entries])

  if (loadFailed && !entries) return <LoadError onRetry={() => setReload((r) => r + 1)} />
  if (!setup || !entries || shown.length === 0) return null

  const label = (k) => measurementLabel(k, types, t, lang)
  const list = entries.filter((e) => e.kind === kind)
  const sorted = [...list].reverse()
  const latest = sorted[0]
  const first = sorted[sorted.length - 1]
  const displayUnit = latest?.unit ?? ''
  const chartData = list.map((e) => ({ ...e, label: shortDate(lang, e.date), shown: round1(convert(e.value, e.unit, displayUnit)) }))
  const change = latest && first && latest.id !== first.id ? round1(convert(latest.value, latest.unit, displayUnit) - convert(first.value, first.unit, displayUnit)) : null

  const unitOf = (k) => {
    const u = unitsFor(typeFor(k, types)?.unitKind)
    return u.length > 1 ? lengthUnit : u[0]
  }
  const formKinds = editing ? [editing.kind] : enabled
  const hasLength = formKinds.some((k) => typeFor(k, types)?.unitKind === 'length')

  async function handleSubmit(e) {
    e.preventDefault()
    const filled = formKinds.filter((k) => values[k] !== undefined && values[k] !== '')
    if (filled.length === 0) return
    setSaving(true)
    try {
      if (editing) {
        await updateMeasurement(uid, editing, { date, value: values[editing.kind], unit: unitOf(editing.kind) })
      } else {
        for (const k of filled) await addMeasurement(uid, { kind: k, date, value: values[k], unit: unitOf(k) })
      }
      setValues({})
      setEditing(null)
      setDate(toLocalISODate())
      setReload((r) => r + 1)
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
      setReload((r) => r + 1)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry) {
    setEditing(entry)
    setDate(entry.date)
    setValues({ [entry.kind]: String(entry.value) })
    if (entry.unit === 'cm' || entry.unit === 'in') setLengthUnit(entry.unit)
  }

  function cancelEdit() {
    setEditing(null)
    setValues({})
    setDate(toLocalISODate())
  }

  const title = onlyWaist ? t('waist.title') : t('measure.title')
  const hint = onlyWaist ? t('waist.hint') : t('measure.hint')

  return (
    <section className="flex flex-col gap-6" aria-label={title}>
      <div>
        <h2 className="text-2xl">{title}</h2>
        <p className="text-chalkdim text-sm mt-1">{hint}</p>
      </div>

      {shown.length > 1 && (
        <div className="flex gap-2 flex-wrap" role="tablist">
          {shown.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={k === kind}
              onClick={() => setSelected(k)}
              className={`min-h-9 px-3 rounded-full text-sm border ${k === kind ? 'bg-accent text-ink border-accent' : 'border-line text-chalkdim hover:text-chalk'}`}
            >
              <bdi>{label(k)}</bdi>
            </button>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('waist.current')} value={latest ? fmt(latest.value, latest.unit) : '—'} />
          <Stat label={t('waist.firstLogged')} value={first ? fmt(first.value, first.unit) : '—'} />
          <Stat label={t('waist.change')} value={change != null ? `${change > 0 ? '+' : ''}${change}${displayUnit}` : '—'} />
        </div>
      )}

      {list.length > 1 && (
        <Card>
          <h3 className="eyebrow mb-4">{onlyWaist ? t('waist.overTime') : t('measure.overTime', { name: label(kind) })}</h3>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" stroke={CHALKDIM} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={CHALKDIM} fontSize={12} tickLine={false} axisLine={false} width={40} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: CHALK }}
                  formatter={(value) => [fmt(value, displayUnit), label(kind)]}
                />
                <Line type="monotone" dataKey="shown" stroke={accentNow()} strokeWidth={2.5} dot={{ fill: accentNow(), r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {formKinds.length > 0 && (
        <Card>
          <h3 className="eyebrow mb-3">
            {editing ? (onlyWaist ? t('waist.editEntry') : t('measure.editEntry', { name: label(editing.kind) })) : onlyWaist ? t('waist.logWaist') : t('measure.log')}
          </h3>
          <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
            <Field label={t('waist.date')}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            {formKinds.map((k) => {
              const unitKind = typeFor(k, types)?.unitKind
              return (
                <Field key={k} label={onlyWaist ? t('waist.waistLabel') : `${label(k)}${unitKind === 'percent' ? ' (%)' : ''}`}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={values[k] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                    placeholder="0"
                    className="w-24"
                    required={formKinds.length === 1}
                  />
                </Field>
              )
            })}
            {hasLength && (
              <Field label={t('waist.unit')}>
                <select value={lengthUnit} onChange={(e) => setLengthUnit(e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </Field>
            )}
            <Button type="submit" disabled={saving}>
              <Plus size={16} /> {editing ? t('common.save') : t('common.add')}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>
                {t('common.cancel')}
              </Button>
            )}
          </form>
          {!editing && formKinds.length > 1 && <p className="text-xs text-chalkdim mt-2">{t('measure.formHint')}</p>}
        </Card>
      )}

      {list.length === 0 && (
        <EmptyState
          title={onlyWaist ? t('waist.emptyTitle') : t('measure.emptyTitle', { name: label(kind) })}
          body={onlyWaist ? t('waist.emptyBody') : t('measure.emptyBody')}
        />
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
                  <bdi dir="ltr">{fmt(e.value, e.unit)}</bdi>
                </span>
                <button onClick={() => startEdit(e)} aria-label={t('common.edit')} className="text-chalkdim hover:text-chalk inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    if (!(await confirm({ title: onlyWaist ? t('waist.deleteConfirm') : t('measure.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
                    try {
                      await deleteMeasurement(uid, e)
                      if (editing?.id === e.id) cancelEdit()
                      setReload((r) => r + 1)
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
      <span className="num text-2xl text-chalk leading-none">
        <bdi dir="ltr">{value}</bdi>
      </span>
      <span className="text-chalkdim text-xs">{label}</span>
    </Card>
  )
}
