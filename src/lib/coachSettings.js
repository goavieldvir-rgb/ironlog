import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// One row per coach (supabase-custom-measurements.sql creates the table,
// supabase-coach-preferences.sql adds the alert settings). Every value
// defaults to how the app worked before coaches could change it.
export const COACH_DEFAULTS = {
  default_measurements: ['waist'],
  tasks_off: [],
  weigh_days: 14,
  food_days: 3,
  behind_pct: 60,
  checkin_days: 7,
  pr_alerts: true,
  snippets: [],
  invite_text: null,
  checkin_questions: [],
  brand_name: null,
  brand_color: null,
  brand_logo: null,
  // Trainees this coach turned off in Needs attention (supabase-attention-off.sql).
  attention_off: [],
  // Trainees this coach marked as priority (same script): shown first, with a star.
  priority: [],
}

export const TASK_KINDS = ['quiet', 'checkin', 'weigh', 'food', 'birthday', 'welcome']

// { settings, available }: available is false while the table or its newer
// columns are missing, so the page can say which script to run.
export async function fetchCoachSettings(coachId) {
  const { data, error } = await supabase.from('coach_settings').select('*').eq('coach_id', coachId).maybeSingle()
  if (error) {
    if (!['42P01', 'PGRST205'].includes(error.code)) console.error(error)
    return { settings: COACH_DEFAULTS, available: false, prefsAvailable: false, extrasAvailable: false, checkinAvailable: false, brandAvailable: false, attentionAvailable: false }
  }
  // Before any row exists, ask whether the newer columns are there.
  const has = async (col) => (data ? col in data : !(await supabase.from('coach_settings').select(col).limit(0)).error)
  const [prefsAvailable, extrasAvailable, checkinAvailable, brandAvailable, attentionAvailable] = await Promise.all([has('pr_alerts'), has('snippets'), has('checkin_questions'), has('brand_color'), has('priority')])
  return { settings: { ...COACH_DEFAULTS, ...(data || {}) }, available: true, prefsAvailable, extrasAvailable, checkinAvailable, brandAvailable, attentionAvailable }
}

export function useCoachSettings(coachId) {
  const [state, setState] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!coachId) return
    let cancelled = false
    fetchCoachSettings(coachId).then((s) => !cancelled && setState(s))
    return () => {
      cancelled = true
    }
  }, [coachId, reload])
  const refresh = useCallback(() => setReload((r) => r + 1), [])
  return [state, refresh]
}

export async function saveCoachSettings(coachId, patch) {
  const { data, error } = await supabase
    .from('coach_settings')
    .upsert({ coach_id: coachId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'coach_id' })
    .select()
    .single()
  if (error) throw error
  return { ...COACH_DEFAULTS, ...data }
}
