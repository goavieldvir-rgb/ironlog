import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// Reads the shared global_exercises table — no user_id filter, since it's
// readable by every signed-in account (see supabase-global-library-upgrade.sql).
export function useGlobalExercises() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('global_exercises')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setData(data || [])
        setLoading(false)
      })
  }, [])

  return [data, loading]
}

// Generic live-ish collection hook: fetches rows owned by `uid` from `table`,
// ordered by `orderField`. Call the returned refresh() after any mutation
// made from the same screen so the list updates immediately.
export function useCollection(uid, table, orderField = 'created_at', direction = 'desc') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)

    supabase
      .from(table)
      .select('*')
      .eq('user_id', uid)
      .order(orderField, { ascending: direction === 'asc' })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error(error)
        setData(data || [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [uid, table, orderField, direction, reload])

  return [data, loading, () => setReload((r) => r + 1)]
}

// ---- Exercises ----
export async function addExercise(uid, exercise) {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      user_id: uid,
      name: exercise.name,
      category: exercise.category || 'strength', // 'strength' | 'mobility'
      video_url: exercise.videoUrl || '',
      notes: exercise.notes || '',
      unit: exercise.unit || 'kg',
      bodyweight: !!exercise.bodyweight,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExercise(uid, id, patch) {
  const row = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.category !== undefined) row.category = patch.category
  if (patch.videoUrl !== undefined) row.video_url = patch.videoUrl
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.unit !== undefined) row.unit = patch.unit
  if (patch.bodyweight !== undefined) row.bodyweight = patch.bodyweight
  const { error } = await supabase.from('exercises').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteExercise(uid, id) {
  const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// ---- Routines ----
export async function addRoutine(uid, routine) {
  const { error } = await supabase.from('routines').insert({
    user_id: uid,
    name: routine.name,
    category: routine.category || 'strength',
    exercises: routine.exercises || [], // [{exerciseId, name, targetSets, targetReps, unit, videoUrl}]
  })
  if (error) throw error
}

export async function updateRoutine(uid, id, patch) {
  const row = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.category !== undefined) row.category = patch.category
  if (patch.exercises !== undefined) row.exercises = patch.exercises
  const { error } = await supabase.from('routines').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteRoutine(uid, id) {
  const { error } = await supabase.from('routines').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// ---- Sessions (a completed workout log) ----
// entries: [{ exerciseId, name, unit, videoUrl, sets: [{weight, reps}] }]
export async function logSession(uid, session) {
  const { error: sessionError } = await supabase.from('sessions').insert({
    user_id: uid,
    routine_id: session.routineId || null,
    routine_name: session.routineName || 'Freestyle',
    category: session.category || 'strength',
    date: session.date, // ISO date string
    notes: session.notes || '',
    entries: session.entries,
  })
  if (sessionError) throw sessionError

  // Denormalize "last performance" onto each exercise for quick lookup
  // when building the next session.
  for (const entry of session.entries) {
    if (!entry.exerciseId) continue
    const completedSets = (entry.sets || []).filter((s) => {
      const repsOk = s.reps !== '' && s.reps !== null
      // Bodyweight exercises don't require a weight to count as a completed
      // set — the added-weight field is optional by design.
      const weightOk = entry.bodyweight ? true : s.weight !== '' && s.weight !== null
      return repsOk && weightOk
    })
    if (completedSets.length === 0) continue
    const last = completedSets[completedSets.length - 1]
    const { error } = await supabase
      .from('exercises')
      .update({
        last_weight: Number(last.weight) || 0,
        last_reps: Number(last.reps),
        last_date: session.date,
        last_sets: completedSets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) })),
      })
      .eq('id', entry.exerciseId)
      .eq('user_id', uid)
    if (error) console.error(error)
  }
}

export async function deleteSession(uid, id) {
  const { error } = await supabase.from('sessions').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// Editing a past session only touches that session's own row — it
// deliberately does NOT update the "last weight/reps" snapshot on
// exercises, since that should reflect the most recent session overall,
// not whichever one happens to be getting corrected right now.
export async function updateSession(uid, id, patch) {
  const row = {}
  if (patch.date !== undefined) row.date = patch.date
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.entries !== undefined) row.entries = patch.entries
  const { error } = await supabase.from('sessions').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

// ---- Body weight tracking ----
export async function addBodyWeightEntry(uid, entry) {
  const { error } = await supabase.from('body_weight_logs').insert({
    user_id: uid,
    date: entry.date,
    weight: Number(entry.weight),
    unit: entry.unit || 'kg',
  })
  if (error) throw error
}

export async function updateBodyWeightEntry(uid, id, patch) {
  const row = {}
  if (patch.date !== undefined) row.date = patch.date
  if (patch.weight !== undefined) row.weight = Number(patch.weight)
  if (patch.unit !== undefined) row.unit = patch.unit
  const { error } = await supabase.from('body_weight_logs').update(row).eq('id', id).eq('user_id', uid)
  if (error) throw error
}

export async function deleteBodyWeightEntry(uid, id) {
  const { error } = await supabase.from('body_weight_logs').delete().eq('id', id).eq('user_id', uid)
  if (error) throw error
}
