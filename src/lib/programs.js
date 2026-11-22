import { supabase } from '../supabase.js'
import { copyRoutineToUser, setScheduleDay } from './db.js'

// Program templates: a coach's set of routines plus a weekly plan, given to
// several trainees at once. Stored in program_templates (see the migration
// 20261118110000_program_templates.sql); who got which program is logged in
// program_assignments.
//
// A program points at the coach's own routines, so editing a routine
// changes every program it is in. Giving a program copies those routines
// into the trainee's account (with their exercises, the same copy as "Give a
// routine") and, unless the coach says otherwise, replaces their weekly plan.

export const DAYS = [0, 1, 2, 3, 4, 5, 6] // 0 = Sunday, as in weekly_schedule
export const SLOTS = [0, 1, 2]

// The table is missing until its migration has run on the live database.
export function programsMissing(error) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /program_templates|program_assignments/.test(error.message || ''))
}

function check({ data, error }) {
  if (error) throw error
  return data
}

export async function fetchPrograms(coachId) {
  return check(
    await supabase.from('program_templates').select('*').eq('coach_id', coachId).order('created_at', { ascending: false }),
  ) || []
}

export async function fetchAssignments(templateIds) {
  if (!templateIds.length) return []
  return check(
    await supabase
      .from('program_assignments')
      .select('id, template_id, trainee_id, assigned_at, replaced_plan')
      .in('template_id', templateIds)
      .order('assigned_at', { ascending: false }),
  ) || []
}

// Keeps only what still makes sense: routines that exist, each placed once
// per day, slots in range.
export function cleanProgram({ name, notes, routineIds, schedule }, routines) {
  const known = new Set(routines.map((r) => r.id))
  const ids = [...new Set(routineIds)].filter((id) => known.has(id))
  const inProgram = new Set(ids)
  const seen = new Set()
  const days = []
  for (const s of schedule) {
    if (!inProgram.has(s.routine_id) || !DAYS.includes(s.day) || !SLOTS.includes(s.slot)) continue
    const key = `${s.day}:${s.slot}`
    const dup = `${s.day}:${s.routine_id}`
    if (seen.has(key) || seen.has(dup)) continue
    seen.add(key)
    seen.add(dup)
    days.push({ day: s.day, slot: s.slot, routine_id: s.routine_id })
  }
  days.sort((a, b) => a.day - b.day || a.slot - b.slot)
  return { name: name.trim().slice(0, 80), notes: (notes || '').trim().slice(0, 1000), routine_ids: ids, schedule: days }
}

export async function saveProgram(coachId, id, program) {
  if (id) {
    check(await supabase.from('program_templates').update(program).eq('id', id).eq('coach_id', coachId))
    return id
  }
  const row = check(await supabase.from('program_templates').insert({ ...program, coach_id: coachId }).select('id').single())
  return row.id
}

export async function deleteProgram(coachId, id) {
  check(await supabase.from('program_templates').delete().eq('id', id).eq('coach_id', coachId))
}

// Days of the week with at least one workout.
export function trainingDays(program) {
  return new Set((program.schedule || []).map((s) => s.day)).size
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
// What a routine asks for, ignoring which account's exercise ids it uses.
function signature(r) {
  return JSON.stringify([
    norm(r.name),
    r.category || 'strength',
    (r.exercises || []).map((it) => [norm(it.name), it.targetSets ?? null, it.targetReps ?? null, it.targetDuration ?? null, it.targetIntensity ?? null]),
  ])
}

// Gives one trainee the program. Routines they already have in exactly this
// form (from an earlier assignment) are reused, so giving a program twice
// doesn't fill their list with duplicates. With replacePlan, their whole
// weekly plan becomes the program's: days the program leaves empty become
// rest days.
export async function assignProgram({ program, routines, traineeId, replacePlan }) {
  const theirs = check(await supabase.from('routines').select('id, name, category, exercises').eq('user_id', traineeId)) || []
  const bySig = new Map(theirs.map((r) => [signature(r), r.id]))
  const idFor = {}
  for (const rid of program.routine_ids || []) {
    const r = routines.find((x) => x.id === rid)
    if (!r) continue
    const existing = bySig.get(signature(r))
    if (existing) {
      idFor[rid] = existing
      continue
    }
    const newId = await copyRoutineToUser(traineeId, r)
    idFor[rid] = newId
    // Their own exercise names can differ in case/spacing; this copy now
    // exists, so a second routine with the same form maps onto it.
    bySig.set(signature(r), newId)
  }

  if (replacePlan) {
    const at = (day, slot) => (program.schedule || []).find((s) => s.day === day && s.slot === slot)
    await Promise.all(
      DAYS.flatMap((day) => SLOTS.map((slot) => setScheduleDay(traineeId, day, slot, idFor[at(day, slot)?.routine_id] || null))),
    )
  }

  check(
    await supabase.from('program_assignments').insert({ template_id: program.id, trainee_id: traineeId, replaced_plan: !!replacePlan }),
  )
}
