// Stored names are snapshots in whatever language was active when the data
// was saved. To make built-in names follow the CURRENT app language we
// resolve them at display time (so old data is fixed with no migration).
// Names the coach typed themselves (routine names) are left as typed.

// Every spelling a freestyle session has ever been saved under.
export const FREESTYLE_NAMES = ['Freestyle', 'Freestyle session', 'אימון חופשי']

// Works for saved sessions (routine_id/routine_name) and drafts/summaries
// (routineName, optional `freestyle` flag, no routine_id).
export function isFreestyleSession(session) {
  if (!session) return false
  if (session.freestyle) return true
  const name = session.routine_name !== undefined ? session.routine_name : session.routineName
  const id = session.routine_id !== undefined ? session.routine_id : session.routineId
  return !id && FREESTYLE_NAMES.includes(name)
}

export function sessionTitle(session, t) {
  if (isFreestyleSession(session)) return t('workout.freestyleSession')
  return session?.routine_name ?? session?.routineName
}

// Prefer the live exercise record (current library names); fall back to the
// bilingual names stored on the entry; finally the legacy single `name`.
export function entryName(entry, exById, lang) {
  const ex = exById?.[entry.exerciseId]
  if (ex) return (lang === 'he' && ex.name_he) || ex.name
  if (lang === 'he') return entry.nameHe || entry.name
  return entry.nameEn || entry.name
}

export function exerciseMap(exercises) {
  const map = {}
  for (const e of exercises || []) map[e.id] = e
  return map
}
