import { supabase } from '../supabase.js'

// Weekly check-ins (supabase-weekly-checkins.sql): the coach writes the
// questions in Coach settings, trainees answer once a week from Home, and
// the coach reads the answers on the trainee's page.

export const QUESTION_TYPES = ['scale', 'number', 'text']
export const MAX_QUESTIONS = 12

// A starting set a coach can take and edit.
export const SUGGESTED_QUESTIONS = [
  { id: 'sleep', type: 'scale', en: 'How well did you sleep this week?', he: 'איך ישנתם השבוע?' },
  { id: 'energy', type: 'scale', en: 'How was your energy in workouts?', he: 'איך הייתה האנרגיה באימונים?' },
  { id: 'stress', type: 'scale', en: 'How stressed were you? (1 = calm, 5 = very)', he: 'כמה לחץ הרגשתם? (1 = רגוע, 5 = מאוד)' },
  { id: 'hunger', type: 'scale', en: 'How hungry were you between meals?', he: 'כמה רעבים הייתם בין הארוחות?' },
  { id: 'notes', type: 'text', en: 'Anything you want me to know? Wins, pain, plans', he: 'משהו שחשוב שאדע? הצלחות, כאבים, תוכניות' },
]

export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// The question in the reader's language, else the other one.
export function questionText(q, lang) {
  const en = (q?.en || '').trim()
  const he = (q?.he || '').trim()
  return lang === 'he' ? he || en : en || he
}

const missing = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)

export async function fetchMyQuestions() {
  const { data, error } = await supabase.rpc('my_checkin_questions')
  if (error) {
    if (!missing(error)) console.error(error)
    return []
  }
  return Array.isArray(data) ? data : []
}

export async function fetchAnswer(uid, weekStart) {
  const { data, error } = await supabase.from('checkin_answers').select('*').eq('user_id', uid).eq('week_start', weekStart).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(error)
    return null
  }
  return data
}

export async function saveAnswer(uid, weekStart, answers, questions) {
  const { error } = await supabase
    .from('checkin_answers')
    .upsert({ user_id: uid, week_start: weekStart, answers, questions, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' })
  if (error) throw error
}

// The coach's view: the latest weeks first. Null when the table is missing.
export async function fetchAnswers(uid, limit = 8) {
  const { data, error } = await supabase
    .from('checkin_answers')
    .select('*')
    .eq('user_id', uid)
    .order('week_start', { ascending: false })
    .limit(limit)
  if (error) return missing(error) ? null : []
  return data || []
}
