import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Check, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { fetchCoachTasks, setCoachTaskDone, addCoachTask, deleteCoachTask } from '../lib/coach.js'
import { Button, Card } from './ui.jsx'

// The coach's to-do list at the top of People: things worth a word with a
// trainee (made each morning by supabase-coach-tasks.sql) and tasks the coach
// writes. Ticking one off moves it to "Done", where it can be undone for a week.
export default function CoachTasks({ trainees, today }) {
  const { t, lang } = useLanguage()
  const { toast, confirm } = useFeedback()
  const [tasks, setTasks] = useState(null)
  const [draft, setDraft] = useState('')
  const [draftFor, setDraftFor] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    fetchCoachTasks(today)
      .then((rows) => !cancelled && setTasks(rows))
      .catch((e) => {
        console.error(e)
        // Not "all done": a failed load must not hide check-ins that are due.
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [today, attempt])

  const nameOf = useMemo(() => Object.fromEntries(trainees.map((p) => [p.id, p.full_name || p.email])), [trainees])
  const open = (tasks || []).filter((x) => !x.done_at)
  const done = (tasks || []).filter((x) => x.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))

  const replace = (row) => setTasks((list) => list.map((x) => (x.id === row.id ? row : x)))

  async function toggle(task) {
    try {
      replace(await setCoachTaskDone(task.id, !task.done_at))
    } catch (e) {
      console.error(e)
      toast(t('tasks.failed'), 'error')
    }
  }

  async function add(e) {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    setAdding(true)
    try {
      const row = await addCoachTask(title, draftFor || null, today)
      setTasks((list) => [...(list || []), row])
      setDraft('')
      setDraftFor('')
    } catch (err) {
      console.error(err)
      toast(t('tasks.failed'), 'error')
    } finally {
      setAdding(false)
    }
  }

  async function remove(task) {
    if (!(await confirm({ title: t('tasks.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
    try {
      await deleteCoachTask(task.id)
      setTasks((list) => list.filter((x) => x.id !== task.id))
    } catch (e) {
      console.error(e)
      toast(t('tasks.failed'), 'error')
    }
  }

  if (tasks === null) return null

  const label = (task) => {
    const name = nameOf[task.trainee_id] || ''
    if (task.kind === 'custom') return task.title
    return t(`tasks.kind.${task.kind}`)(name, task.n)
  }

  const row = (task) => {
    const isDone = !!task.done_at
    const overdue = !isDone && task.due < today
    return (
      <li key={task.id} className="flex items-start gap-3 py-2">
        <button
          type="button"
          onClick={() => toggle(task)}
          aria-pressed={isDone}
          aria-label={isDone ? t('tasks.markOpen') : t('tasks.markDone')}
          className={`press shrink-0 mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center ${
            isDone ? 'bg-goodbtn border-goodbtn text-chalk' : 'border-chalkdim/60'
          }`}
        >
          {isDone && <Check size={14} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isDone ? 'line-through text-chalkdim' : ''}`}>{label(task)}</p>
          <p className="text-xs text-chalkdim flex gap-2 flex-wrap">
            {task.kind === 'custom' && nameOf[task.trainee_id] && <span>{nameOf[task.trainee_id]}</span>}
            {task.trainee_id && !isDone && (
              <Link to={`/people/${task.trainee_id}`} className="underline underline-offset-2">
                {t('tasks.open')}
              </Link>
            )}
            {overdue && <span className="text-accent">{t('tasks.since', { date: fmtDate(lang, new Date(task.due + 'T00:00:00'), { month: 'short', day: 'numeric' }) })}</span>}
            {isDone && task.auto_done && <span>{t('tasks.autoDone')}</span>}
          </p>
        </div>
        {task.kind === 'custom' && (
          <button type="button" onClick={() => remove(task)} aria-label={t('common.delete')} className="press shrink-0 text-chalkdim p-1">
            <Trash2 size={15} />
          </button>
        )}
      </li>
    )
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <ListChecks size={18} /> {t('tasks.title')}
          {open.length > 0 && <span className="num text-xs rounded-full bg-accent text-ink px-2 py-0.5">{open.length}</span>}
        </div>
      </div>
      {loadFailed && tasks === null ? (
        <div role="alert" className="flex items-center justify-between gap-3">
          <p className="text-sm text-chalkdim">{t('common.loadFailedTitle')}</p>
          <Button type="button" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.tryAgain')}
          </Button>
        </div>
      ) : tasks === null ? null : open.length === 0 ? (
        <p className="text-sm text-chalkdim">{t('tasks.allDone')}</p>
      ) : (
        <ul className="divide-y divide-surface2">{open.map(row)}</ul>
      )}

      <form onSubmit={add} className="flex gap-2 flex-wrap items-center pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder={t('tasks.addPlaceholder')}
          aria-label={t('tasks.addPlaceholder')}
          className="flex-1 min-w-[10rem]"
        />
        <select value={draftFor} onChange={(e) => setDraftFor(e.target.value)} aria-label={t('tasks.about')} className="max-w-[10rem]">
          <option value="">{t('tasks.aboutNobody')}</option>
          {trainees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
        <button type="submit" disabled={adding || !draft.trim()} aria-label={t('tasks.add')} className="press shrink-0 w-11 h-11 rounded-[14px] bg-surface2 flex items-center justify-center disabled:opacity-40">
          <Plus size={18} />
        </button>
      </form>

      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="press self-start text-xs text-chalkdim flex items-center gap-1 pt-1">
            {showDone ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {t('tasks.done', { n: done.length })}
          </button>
          {showDone && <ul className="divide-y divide-surface2">{done.map(row)}</ul>}
        </>
      )}
    </Card>
  )
}
