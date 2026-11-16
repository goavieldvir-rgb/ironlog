import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// Body measurements a coach can turn on for a trainee. Waist keeps its own
// table (waist_logs, from before this was customizable); everything else
// lives in body_measurements, keyed by these names or c_<id> for a
// measurement the coach made up (measurement_types).
export const BUILT_IN = [
  { key: 'waist', unitKind: 'length' },
  { key: 'hips', unitKind: 'length' },
  { key: 'chest', unitKind: 'length' },
  { key: 'upper_arm', unitKind: 'length' },
  { key: 'thigh', unitKind: 'length' },
  { key: 'calf', unitKind: 'length' },
  { key: 'neck', unitKind: 'length' },
  { key: 'body_fat', unitKind: 'percent' },
]
const BUILT_IN_KEYS = new Set(BUILT_IN.map((b) => b.key))

export const customKey = (id) => `c_${id}`
export const isCustomKey = (k) => typeof k === 'string' && k.startsWith('c_')

const FALLBACK = { kinds: ['waist'], own: false, defaultKinds: ['waist'], types: [], available: false }

// What one person logs: { kinds, own, defaultKinds, types, available }.
// available is false until supabase-custom-measurements.sql has been run;
// the app then keeps showing waist only, as before.
export function useMeasurementSetup(uid) {
  const [setup, setSetup] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    fetchMeasurementSetup(uid).then((s) => !cancelled && setSetup(s))
    return () => {
      cancelled = true
    }
  }, [uid, reload])
  const refresh = useCallback(() => setReload((r) => r + 1), [])
  return [setup, refresh]
}

export async function fetchMeasurementSetup(uid) {
  const { data, error } = await supabase.rpc('measurement_setup', { p_user: uid })
  if (error || !data) {
    if (error && !['PGRST202', '42883'].includes(error.code)) console.error(error)
    return FALLBACK
  }
  return {
    kinds: (data.kinds || ['waist']).filter((k) => BUILT_IN_KEYS.has(k) || isCustomKey(k)),
    own: !!data.own,
    defaultKinds: data.default_kinds || ['waist'],
    types: data.types || [],
    available: true,
  }
}

export function typeFor(kind, types = []) {
  const b = BUILT_IN.find((x) => x.key === kind)
  if (b) return { key: kind, unitKind: b.unitKind, builtIn: true }
  const ct = types.find((x) => customKey(x.id) === kind)
  if (!ct) return null
  return { key: kind, unitKind: ct.unit_kind, builtIn: false, labelEn: ct.label_en, labelHe: ct.label_he, archived: ct.archived }
}

// A built-in name comes from the translations; a coach's own shows the
// name in the reader's language, or the other one when only one was given.
export function measurementLabel(kind, types, t, lang) {
  const ty = typeFor(kind, types)
  if (!ty) return t('measure.unknown')
  if (ty.builtIn) return t(`measure.kinds.${kind}`)
  const he = (ty.labelHe || '').trim()
  const en = (ty.labelEn || '').trim()
  return lang === 'he' ? he || en : en || he
}

export function unitsFor(unitKind) {
  if (unitKind === 'percent') return ['%']
  if (unitKind === 'number') return ['']
  return ['cm', 'in']
}

// Lengths can be logged in cm or in: convert before subtracting or plotting.
const CM_PER_IN = 2.54
export function convert(value, from, to) {
  if (from === to) return value
  if (from === 'in' && to === 'cm') return value * CM_PER_IN
  if (from === 'cm' && to === 'in') return value / CM_PER_IN
  return value
}
export const round1 = (n) => Math.round(n * 10) / 10

// Everything one person logged, waist included, as
// { id, kind, date, value, unit, created_at }. A table whose migration
// hasn't been run reads as empty; any other failure throws.
const MISSING_TABLE = ['42P01', 'PGRST205']
export async function fetchMeasurements(uid) {
  const opt = (p) =>
    p.then(({ data, error }) => {
      if (error && !MISSING_TABLE.includes(error.code)) throw error
      return data || []
    })
  const [waists, others] = await Promise.all([
    opt(supabase.from('waist_logs').select('id, date, waist, unit, created_at').eq('user_id', uid)),
    opt(supabase.from('body_measurements').select('id, kind, date, value, unit, created_at').eq('user_id', uid)),
  ])
  return [
    ...waists.map((w) => ({ id: w.id, kind: 'waist', date: w.date, value: Number(w.waist), unit: w.unit, created_at: w.created_at })),
    ...others.map((m) => ({ ...m, value: Number(m.value) })),
  ].sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? -1 : 1) : a.date < b.date ? -1 : 1))
}

export async function addMeasurement(uid, { kind, date, value, unit }) {
  const res =
    kind === 'waist'
      ? await supabase.from('waist_logs').insert({ user_id: uid, date, waist: Number(value), unit: unit || 'cm' })
      : await supabase.from('body_measurements').insert({ user_id: uid, kind, date, value: Number(value), unit: unit ?? '' })
  if (res.error) throw res.error
}

export async function updateMeasurement(uid, entry, { date, value, unit }) {
  const res =
    entry.kind === 'waist'
      ? await supabase.from('waist_logs').update({ date, waist: Number(value), unit }).eq('id', entry.id).eq('user_id', uid)
      : await supabase.from('body_measurements').update({ date, value: Number(value), unit }).eq('id', entry.id).eq('user_id', uid)
  if (res.error) throw res.error
}

export async function deleteMeasurement(uid, entry) {
  const table = entry.kind === 'waist' ? 'waist_logs' : 'body_measurements'
  const { error } = await supabase.from(table).delete().eq('id', entry.id).eq('user_id', uid)
  if (error) throw error
}

// ---- Coach side ----

export async function setPersonMeasurements(uid, kinds) {
  const { error } = await supabase
    .from('measurement_settings')
    .upsert({ user_id: uid, kinds, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

// Back to following the coach's default list.
export async function clearPersonMeasurements(uid) {
  const { error } = await supabase.from('measurement_settings').delete().eq('user_id', uid)
  if (error) throw error
}

export async function setDefaultMeasurements(coachId, kinds) {
  const { error } = await supabase
    .from('coach_settings')
    .upsert({ coach_id: coachId, default_measurements: kinds, updated_at: new Date().toISOString() }, { onConflict: 'coach_id' })
  if (error) throw error
}

export async function addMeasurementType(coachId, { labelEn, labelHe, unitKind }) {
  const { data, error } = await supabase
    .from('measurement_types')
    .insert({ coach_id: coachId, label_en: labelEn?.trim() || null, label_he: labelHe?.trim() || null, unit_kind: unitKind })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setMeasurementTypeArchived(id, archived) {
  const { error } = await supabase.from('measurement_types').update({ archived }).eq('id', id)
  if (error) throw error
}
