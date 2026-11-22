import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Check, X, Search, Users, CalendarDays, AlertTriangle } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection } from '../lib/db.js'
import { fetchRoster } from '../lib/coach.js'
import { fmtDate } from '../lib/dates.js'
import { useScrollLock } from '../lib/scrollLock.js'
import { useDialog } from './Modal.jsx'
import { Button, Card, Badge, CategoryTag, EmptyState, Field, LoadError } from './ui.jsx'
import { PageLoader } from './Loading.jsx'
import OverflowMenu from './OverflowMenu.jsx'
import {
  DAYS,
  SLOTS,
  programsMissing,
  fetchPrograms,
  fetchAssignments,
  cleanProgram,
  saveProgram,
  deleteProgram,
  trainingDays,
  assignProgram,
} from '../lib/programs.js'

// Programs: a coach's routines plus a weekly plan, saved once and given to
// several trainees in one step. Lives under People (/people/programs).
export default function Programs() {
  const { user } = useAuth()
  const coachId = user?.uid
  const { t, lang } = useLanguage()
  const { toast, confirm } = useFeedback()
  const [routines, routinesLoading] = useCollection(coachId, 'routines', 'created_at', 'desc')
  const [programs, setPrograms] = useState([])
  const [assignments, setAssignments] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null) // null | {} (new) | program
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    if (!coachId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [list, people] = await Promise.all([fetchPrograms(coachId), fetchRoster().catch(() => [])])
        const given = await fetchAssignments(list.map((p) => p.id))
        if (cancelled) return
        setPrograms(list)
        setAssignments(given)
        setRoster(people)
        setLoadError(null)
      } catch (e) {
        console.error(e)
        if (!cancelled) setLoadError(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [coachId, reload])

  const trainees = useMemo(
    () =>
      roster
        .filter((p) => p.id !== coachId && !p.is_admin && !p.is_coach && !p.removed)
        .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', lang)),
    [roster, coachId, lang],
  )
  const nameOf = useMemo(() => Object.fromEntries(roster.map((p) => [p.id, p.full_name || p.email])), [roster])

  // Latest assignment per program and trainee: who is on each program now.
  const onProgram = useMemo(() => {
    const latestFor = {}
    for (const a of assignments) if (!latestFor[a.trainee_id]) latestFor[a.trainee_id] = a // newest first
    const by = {}
    for (const a of Object.values(latestFor)) (by[a.template_id] ||= []).push(a)
    return by
  }, [assignments])

  async function remove(p) {
    const ok = await confirm({
      title: t('programs.deleteTitle', { name: p.name }),
      body: t('programs.deleteBody'),
      confirmLabel: t('programs.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteProgram(coachId, p.id)
      setPrograms((list) => list.filter((x) => x.id !== p.id))
      toast(t('programs.deleted'))
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
    }
  }

  const missing = programsMissing(loadError)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link to="/people" className="eyebrow inline-flex items-center gap-1 mb-2">
            <BackChevron size={14} /> {t('people.title')}
          </Link>
          <h1 className="text-3xl">{t('programs.title')}</h1>
          <p className="text-chalkdim text-sm mt-1 max-w-xl">{t('programs.subtitle')}</p>
        </div>
        {!missing && (
          <Button variant="brass" onClick={() => setEditing({})} disabled={loading && !programs.length}>
            <Plus size={16} /> {t('programs.new')}
          </Button>
        )}
      </div>

      {loading && !programs.length && !loadError && <PageLoader />}

      {missing && (
        <Card className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-chalkdim shrink-0 mt-0.5" />
          <p className="text-sm text-chalkdim">{t('programs.notReady')}</p>
        </Card>
      )}
      {loadError && !missing && !programs.length && <LoadError onRetry={() => setReload((r) => r + 1)} />}

      {!loading && !loadError && programs.length === 0 && (
        <EmptyState
          title={t('programs.emptyTitle')}
          body={t('programs.emptyBody')}
          action={
            <Button variant="brass" onClick={() => setEditing({})}>
              <Plus size={16} /> {t('programs.new')}
            </Button>
          }
        />
      )}

      {programs.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {programs.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              routines={routines}
              routinesLoading={routinesLoading}
              people={(onProgram[p.id] || []).map((a) => nameOf[a.trainee_id]).filter(Boolean)}
              lastGiven={(onProgram[p.id] || [])[0]?.assigned_at}
              t={t}
              lang={lang}
              onAssign={() => setAssigning(p)}
              onEdit={() => setEditing(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ProgramEditor
          program={editing}
          routines={routines}
          coachId={coachId}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null)
            setReload((r) => r + 1)
            toast(t('programs.saved'))
            // A new program's next step is almost always giving it to someone.
            if (isNew && trainees.length > 0) setAssigning(saved)
          }}
        />
      )}

      {assigning && (
        <AssignSheet
          program={assigning}
          routines={routines}
          trainees={trainees}
          onProgramIds={new Set((onProgram[assigning.id] || []).map((a) => a.trainee_id))}
          t={t}
          onClose={(changed) => {
            setAssigning(null)
            if (changed) setReload((r) => r + 1)
          }}
        />
      )}
    </div>
  )
}

function routinesOf(program, routines) {
  return (program.routine_ids || []).map((id) => routines.find((r) => r.id === id)).filter(Boolean)
}

function ProgramCard({ program, routines, routinesLoading, people, lastGiven, t, lang, onAssign, onEdit, onDelete }) {
  const list = routinesOf(program, routines)
  const lost = routinesLoading ? 0 : (program.routine_ids || []).length - list.length
  const days = trainingDays(program)
  const nameFor = (id) => routines.find((r) => r.id === id)?.name
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg text-chalk break-words">{program.name}</h2>
          <p className="text-xs text-chalkdim mt-0.5 num">
            {t('programs.meta')(list.length, days)}
          </p>
        </div>
        <OverflowMenu
          label={t('programs.more')}
          items={[
            { key: 'edit', label: t('programs.edit'), icon: <Pencil size={15} />, onClick: onEdit },
            { key: 'delete', label: t('programs.delete'), icon: <Trash2 size={15} />, onClick: onDelete, danger: true },
          ]}
        />
      </div>

      {program.notes && <p className="text-sm text-chalkdim whitespace-pre-wrap line-clamp-3 -mt-2">{program.notes}</p>}

      <WeekGrid schedule={program.schedule || []} nameFor={nameFor} t={t} />

      {lost > 0 && <p className="text-xs text-irontext">{t('programs.routinesGone')(lost)}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-line">
        <p className="text-xs text-chalkdim min-w-0 flex items-center gap-1.5">
          <Users size={13} className="shrink-0" />
          <span className="truncate">
            {people.length === 0 ? t('programs.nobodyYet') : t('programs.onIt')(people)}
            {lastGiven ? ` · ${fmtDate(lang, new Date(lastGiven), { month: 'short', day: 'numeric' })}` : ''}
          </span>
        </p>
        <Button variant="brass" className="shrink-0 w-full sm:w-auto" onClick={onAssign} disabled={list.length === 0}>
          {t('programs.give')}
        </Button>
      </div>
    </Card>
  )
}

// The program's week, Sunday first like the trainee's own plan.
function WeekGrid({ schedule, nameFor, t }) {
  return (
    <ul className="flex flex-col">
      {DAYS.map((day) => {
        const names = schedule
          .filter((s) => s.day === day)
          .sort((a, b) => a.slot - b.slot)
          .map((s) => nameFor(s.routine_id))
          .filter(Boolean)
        return (
          <li key={day} className="flex items-baseline gap-3 py-1.5 border-b border-line/60 last:border-0">
            <span className="w-10 shrink-0 text-xs text-chalkdim">{t(`dashboard.dayShort${day}`)}</span>
            <span className={`flex-1 min-w-0 text-sm break-words ${names.length ? 'text-chalk' : 'text-chalkdim/60'}`}>
              {names.length ? names.join(' · ') : t('dashboard.restDay')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// A dialog that fills a phone screen and sits centred on a desktop.
function Sheet({ label, onClose, children, footer, wide = false }) {
  const { t } = useLanguage()
  useScrollLock(true)
  const ref = useRef(null)
  const dialogProps = useDialog(true, onClose, ref)
  return createPortal(
    <div
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center sm:p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`card w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] flex flex-col rounded-b-none sm:rounded-b-[inherit]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
          <h2 className="text-xl min-w-0 break-words">{label}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="hit text-chalkdim hover:text-chalk shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        <div
          className="flex justify-end gap-2 px-5 pt-3 border-t border-line"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const SLOT_FOR = { mobility: 0, strength: 1, cardio: 2 }

function ProgramEditor({ program, routines, coachId, t, onClose, onSaved }) {
  const { toast, confirm } = useFeedback()
  const isNew = !program.id
  const [name, setName] = useState(program.name || '')
  const [notes, setNotes] = useState(program.notes || '')
  const [picked, setPicked] = useState(() => (program.routine_ids || []).filter((id) => routines.some((r) => r.id === id)))
  const [schedule, setSchedule] = useState(() => program.schedule || [])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const start = useRef(JSON.stringify([program.name || '', program.notes || '', picked, schedule]))
  const dirty = JSON.stringify([name, notes, picked, schedule]) !== start.current

  const inProgram = picked.map((id) => routines.find((r) => r.id === id)).filter(Boolean)
  const shown = routines.filter((r) => !query || r.name.toLowerCase().includes(query.trim().toLowerCase()))

  function toggle(id) {
    if (picked.includes(id)) {
      setPicked((p) => p.filter((x) => x !== id))
      setSchedule((s) => s.filter((x) => x.routine_id !== id))
    } else setPicked((p) => [...p, id])
  }

  function place(day, routineId) {
    const r = routines.find((x) => x.id === routineId)
    if (!r) return
    setSchedule((s) => {
      const taken = new Set(s.filter((x) => x.day === day).map((x) => x.slot))
      if (taken.size >= SLOTS.length) return s
      // Each slot has a label in the trainee's week (mobility, strength,
      // cardio): use the routine's own when it's free.
      const want = SLOT_FOR[r.category] ?? 1
      const slot = taken.has(want) ? SLOTS.find((x) => !taken.has(x)) : want
      return [...s, { day, slot, routine_id: routineId }]
    })
  }

  function unplace(day, slot) {
    setSchedule((s) => s.filter((x) => !(x.day === day && x.slot === slot)))
  }

  async function close() {
    if (dirty && !saving) {
      const ok = await confirm({ title: t('programs.discardTitle'), body: t('programs.discardBody'), confirmLabel: t('programs.discard'), danger: true })
      if (!ok) return
    }
    onClose()
  }

  async function save() {
    if (!name.trim()) {
      toast(t('programs.nameNeeded'), 'error')
      return
    }
    setSaving(true)
    try {
      const clean = cleanProgram({ name, notes, routineIds: picked, schedule }, routines)
      const id = await saveProgram(coachId, program.id, clean)
      onSaved({ ...program, ...clean, id }, isNew)
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
      setSaving(false)
    }
  }

  return (
    <Sheet
      label={isNew ? t('programs.new') : t('programs.editTitle')}
      onClose={close}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t('programs.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('programs.namePlaceholder')} data-autofocus />
        </Field>
        <Field label={t('programs.notes')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder={t('programs.notesPlaceholder')} />
        </Field>

        <section className="flex flex-col gap-2">
          <div>
            <h3 className="eyebrow">{t('programs.routinesStep')}</h3>
            <p className="text-xs text-chalkdim mt-1">{t('programs.routinesHint')}</p>
          </div>
          {routines.length === 0 ? (
            <div className="rounded-[14px] bg-surface2 px-4 py-3 text-sm text-chalkdim flex items-center justify-between gap-3 flex-wrap">
              {t('programs.noRoutines')}
              <Button variant="ghost" to="/routines/new">
                <Plus size={15} /> {t('programs.makeRoutine')}
              </Button>
            </div>
          ) : (
            <>
              {routines.length > 8 && (
                <label className="relative block">
                  <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-chalkdim pointer-events-none" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('programs.searchRoutines')} aria-label={t('programs.searchRoutines')} className="w-full ps-9" />
                </label>
              )}
              <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto -mx-1 px-1">
                {shown.map((r) => {
                  const on = picked.includes(r.id)
                  return (
                    <li key={r.id}>
                      <label className={`press-row flex items-center gap-3 px-3 min-h-[48px] rounded-[12px] cursor-pointer ${on ? 'bg-surface2' : 'hover:bg-surface2/60'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="w-5 h-5 shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-sm">{r.name}</span>
                        <span className="text-[11px] text-chalkdim num shrink-0">{t('programs.exerciseCount')((r.exercises || []).length)}</span>
                        <CategoryTag category={r.category} />
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div>
            <h3 className="eyebrow">{t('programs.weekStep')}</h3>
            <p className="text-xs text-chalkdim mt-1">{inProgram.length ? t('programs.weekHint') : t('programs.weekNeedsRoutines')}</p>
          </div>
          <ul className="flex flex-col rounded-[14px] bg-surface2/50">
            {DAYS.map((day) => {
              const placed = schedule.filter((s) => s.day === day).sort((a, b) => a.slot - b.slot)
              const options = inProgram.filter((r) => !placed.some((s) => s.routine_id === r.id))
              const dayName = t(`dashboard.day${day}`)
              return (
                <li key={day} className="flex items-start gap-3 px-3 py-2 min-h-[52px] border-b border-line/60 last:border-0">
                  <span className="w-10 shrink-0 text-xs text-chalkdim pt-2.5">{t(`dashboard.dayShort${day}`)}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap py-0.5">
                    {placed.length === 0 && <span className="text-sm text-chalkdim/60 me-1">{t('dashboard.restDay')}</span>}
                    {placed.map((s) => (
                      <span key={s.slot} className="inline-flex items-center gap-1 rounded-full bg-surface2 ps-3 pe-1 min-h-8 text-sm max-w-full">
                        <span className="truncate">{routines.find((r) => r.id === s.routine_id)?.name}</span>
                        <button
                          type="button"
                          onClick={() => unplace(day, s.slot)}
                          aria-label={t('programs.unplace')(routines.find((r) => r.id === s.routine_id)?.name || '', dayName)}
                          className="w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-chalkdim hover:text-chalk"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                    {placed.length < SLOTS.length && options.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => place(day, e.target.value)}
                        aria-label={t('programs.addTo')(dayName)}
                        style={{ width: 'auto' }}
                        className="text-sm min-h-8 py-1 rounded-full text-chalkdim"
                      >
                        <option value="">{t('programs.addShort')}</option>
                        {options.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </Sheet>
  )
}

function AssignSheet({ program, routines, trainees, onProgramIds, t, onClose }) {
  const { confirm } = useFeedback()
  const [selected, setSelected] = useState(() => new Set())
  const [replacePlan, setReplacePlan] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState({}) // id -> 'busy' | 'done' | 'failed'
  const [running, setRunning] = useState(false)
  const changed = useRef(false)

  const q = query.trim().toLowerCase()
  const shown = trainees.filter((p) => !q || `${p.full_name || ''} ${p.email || ''}`.toLowerCase().includes(q))
  const done = Object.values(status).filter((s) => s === 'done').length
  const failed = Object.entries(status).filter(([, s]) => s === 'failed').map(([id]) => id)
  const finished = !running && Object.keys(status).length > 0
  const pending = [...selected].filter((id) => status[id] !== 'done')
  const allShown = shown.length > 0 && shown.every((p) => selected.has(p.id))
  const list = routinesOf(program, routines)

  function toggle(id) {
    if (running) return
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s)
      for (const p of shown) allShown ? n.delete(p.id) : n.add(p.id)
      return n
    })
  }

  async function run() {
    const ids = pending
    if (!ids.length) return
    const withPlan = trainees.filter((p) => ids.includes(p.id) && p.planned_per_week > 0)
    if (replacePlan && withPlan.length > 0) {
      const ok = await confirm({
        title: t('programs.replaceTitle')(withPlan.length),
        body: t('programs.replaceBody')(withPlan.map((p) => p.full_name || p.email)),
        confirmLabel: t('programs.replaceConfirm'),
      })
      if (!ok) return
    }
    setRunning(true)
    for (const id of ids) {
      setStatus((s) => ({ ...s, [id]: 'busy' }))
      try {
        await assignProgram({ program, routines, traineeId: id, replacePlan })
        changed.current = true
        setStatus((s) => ({ ...s, [id]: 'done' }))
      } catch (e) {
        console.error(e)
        setStatus((s) => ({ ...s, [id]: 'failed' }))
      }
    }
    setRunning(false)
  }

  const close = () => !running && onClose(changed.current)

  return (
    <Sheet
      label={t('programs.giveTitle', { name: program.name })}
      onClose={close}
      footer={
        finished && pending.length === 0 ? (
          <Button onClick={close}>{t('common.done')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={running}>
              {finished ? t('common.done') : t('common.cancel')}
            </Button>
            <Button onClick={run} disabled={running || pending.length === 0}>
              {running
                ? t('programs.giving')(done + failed.length, Object.keys(status).length)
                : failed.length
                  ? t('programs.retry')(failed.length)
                  : t('programs.giveTo')(pending.length)}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-chalkdim">{t('programs.giveHint')(list.length, trainingDays(program))}</p>

        {finished && (
          <p role="status" className={`text-sm ${failed.length ? 'text-irontext' : 'text-good'}`}>
            {failed.length ? t('programs.someFailed')(done, failed.length) : t('programs.allGiven')(done)}
          </p>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={replacePlan}
          onClick={() => !running && setReplacePlan((v) => !v)}
          className="press-row flex items-start gap-3 text-start rounded-[14px] bg-surface2 px-4 py-3"
        >
          <span className={`mt-0.5 shrink-0 w-9 h-5 rounded-full relative transition-colors ${replacePlan ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-chalk transition-all ${replacePlan ? 'end-0.5' : 'start-0.5'}`} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-chalk inline-flex items-center gap-1.5">
              <CalendarDays size={14} /> {t('programs.replacePlan')}
            </span>
            <span className="block text-xs text-chalkdim mt-0.5">{replacePlan ? t('programs.replaceOn') : t('programs.replaceOff')}</span>
          </span>
        </button>

        {trainees.length === 0 ? (
          <p className="text-sm text-chalkdim">{t('programs.noTrainees')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {trainees.length > 6 && (
              <label className="relative block">
                <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-chalkdim pointer-events-none" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('people.searchPlaceholder')} aria-label={t('people.searchPlaceholder')} className="w-full ps-9" />
              </label>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">{t('programs.who')}</span>
              {shown.length > 1 && (
                <button type="button" onClick={toggleAll} disabled={running} className="text-xs text-chalkdim hover:text-chalk min-h-9 px-1">
                  {allShown ? t('programs.selectNone') : t('programs.selectAll')}
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {shown.map((p) => {
                const st = status[p.id]
                return (
                  <li key={p.id}>
                    <label className={`press-row flex items-center gap-3 px-3 min-h-[52px] rounded-[12px] cursor-pointer ${selected.has(p.id) ? 'bg-surface2' : 'hover:bg-surface2/60'}`}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={running || st === 'done'} className="w-5 h-5 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{p.full_name || p.email}</span>
                        <span className="block text-[11px] text-chalkdim">
                          {p.planned_per_week > 0 ? t('programs.hasPlan')(p.planned_per_week) : t('programs.noPlan')}
                        </span>
                      </span>
                      {onProgramIds.has(p.id) && !st && <Badge>{t('programs.onThis')}</Badge>}
                      {st === 'busy' && <span className="text-xs text-chalkdim shrink-0">{t('common.saving')}</span>}
                      {st === 'done' && <Check size={16} className="text-good shrink-0" aria-label={t('programs.givenAria')} />}
                      {st === 'failed' && <span className="text-xs text-irontext shrink-0">{t('programs.failed')}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
