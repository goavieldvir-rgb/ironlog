import ExerciseVideo from './ExerciseVideo.jsx'
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Pencil, MessageSquareText, Check, Trash2 } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, updateTrainerComment, deleteSession } from '../lib/db.js'
import { markSessionsReviewed } from '../lib/coach.js'
import { sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { Card, CategoryTag, Badge, Button } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { isWarmup, workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { formatPace } from '../lib/cardio.js'
import CardioTotals from './CardioTotals.jsx'

function formatDate(lang, iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return fmtDate(lang, d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatSet(entry, s, t) {
  if (entry.category === 'cardio') {
    const intensityLabel = entry.intensityType === 'hr_zone' ? t('exercises.hrZone') : t('exercises.rpe')
    const sd = Number(s.distance), sm = Number(s.duration)
    // Each piece is isolated left-to-right (U+2066 ... U+2069) so a Hebrew
    // unit label can't reorder the numbers around it.
    const parts = [`${s.duration || 0} ${t('sessionCard.minUnit')}`, `${intensityLabel} ${s.intensity || 0}`]
    if (s.distance !== '' && s.distance != null) parts.push(`${s.distance}${entry.unit}`)
    if (sd > 0 && sm > 0) parts.push(`${formatPace(sm / sd)}/${entry.unit === 'mi' ? 'mi' : 'km'}`)
    return parts.map((p) => `⁦${p}⁩`).join(' · ')
  }
  if (entry.timed) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${entry.unit} · ` : ''
    return `${added}${formatSeconds(s.reps) || '0s'}`
  }
  if (entry.bodyweight) {
    const added = Number(s.weight) > 0 ? `+${s.weight}${entry.unit} ` : ''
    const rir = s.rir !== '' && s.rir != null ? ` · RIR ${s.rir}` : ''
    return `${added}${t('sessionCard.bwShort')} × ${s.reps || 0}${rir}`
  }
  const rir = s.rir !== '' && s.rir != null ? ` · RIR ${s.rir}` : ''
  return `${s.weight || 0}${entry.unit} × ${s.reps || 0}${rir}`
}

// The set that beat everything logged for this exercise in earlier sessions.
// Returns its index, or -1. A first-ever session is not a record.
function prSetIndex(entry, session, sessions) {
  if (entry.category === 'cardio' || !entry.exerciseId) return -1
  const metric = (set) => Number(entry.bodyweight || entry.timed ? set.reps : set.weight)
  const valid = (set) => !isWarmup(set) && set.reps !== '' && set.reps != null && isFinite(metric(set))
  let prior = null
  for (const o of sessions) {
    if (o.id === session.id) continue
    const earlier = o.date < session.date || (o.date === session.date && (o.created_at || '') < (session.created_at || ''))
    if (!earlier) continue
    for (const e of o.entries || []) {
      if (e.exerciseId !== entry.exerciseId) continue
      for (const set of e.sets || []) if (valid(set) && (prior == null || metric(set) > prior)) prior = metric(set)
    }
  }
  if (prior == null || prior <= 0) return -1
  let best = -1
  let bestVal = prior
  ;(entry.sets || []).forEach((set, j) => {
    if (valid(set) && metric(set) > bestVal) {
      best = j
      bestVal = metric(set)
    }
  })
  return best
}

export default function SessionDetail() {
  const { effectiveUid, isAdmin, actingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const { confirm, toast } = useFeedback()
  const [rawSessions, loading, refresh] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const sessions = useMemo(() => applyCurrentTimed(rawSessions, exercises), [rawSessions, exercises])
  const exById = useMemo(() => exerciseMap(exercises), [exercises])
  const session = sessions.find((s) => s.id === id)

  // The coach opening a trainee's workout clears it from their "to review"
  // list on the People page.
  const unreviewed = isAdmin && actingAs && session && !session.reviewed_at
  useEffect(() => {
    if (unreviewed) markSessionsReviewed(effectiveUid, [session.id]).catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreviewed, session?.id])

  if (!loading && !session) return <p className="text-chalkdim">{t('sessionDetail.notFound')}</p>
  if (!session) return null

  async function remove() {
    if (!(await confirm({ title: t('history.deleteConfirm'), body: t('feedback.cantUndo'), confirmLabel: t('common.delete'), danger: true }))) return
    try {
      await deleteSession(effectiveUid, session.id)
      toast(t('feedback.deleted'))
      navigate('/history', { replace: true })
    } catch {
      toast(t('feedback.deleteFailed'), 'error')
    }
  }

  const totalSets = (session.entries || []).reduce((n, e) => n + workingSets(e.sets).length, 0)
  const meta = [
    formatDate(lang, session.date),
    session.duration_minutes ? t('workout.durationShort', { min: session.duration_minutes }) : null,
    totalSets > 0 ? `${totalSets} ${t('history.setsLabel')}` : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5 max-w-2xl pb-[120px]">
      <Link to="/history" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit min-h-[44px] -mb-3">
        <BackChevron size={16} /> {t('sessionDetail.back')}
      </Link>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[30px] leading-9 min-w-0">{sessionTitle(session, t)}</h1>
          <Link
            to={`/history/${session.id}/edit`}
            className="press shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-surface text-sm font-medium text-chalk"
          >
            <Pencil size={14} /> {t('sessionDetail.edit')}
          </Link>
        </div>
        <p className="text-chalkdim text-[13px] tabular-nums">{meta.join(' · ')}</p>
        <div className="mt-1">
          <CategoryTag category={session.category} />
        </div>
      </div>

      <TrainerComment session={session} effectiveUid={effectiveUid} isAdmin={isAdmin} onSaved={refresh} t={t} />

      {session.notes && <p className="text-chalkdim text-[15px] px-1">{session.notes}</p>}

      {(session.entries || []).map((entry, i) => {
        const prIdx = prSetIndex(entry, session, sessions)
        let n = 0
        return (
          <section key={i} className="bg-surface rounded-[20px] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h2 className="text-[17px] leading-6">{entryName(entry, exById, lang)}</h2>
                {entry.category === 'cardio' && <Badge tone="cardio">{t('sessionCard.cardioBadge')}</Badge>}
                {entry.category !== 'cardio' && entry.timed ? <Badge tone="brass">{t('exercises.timedBadge')}</Badge> : entry.category !== 'cardio' && entry.bodyweight && <Badge tone="brass">{t('sessionCard.bodyweightBadge')}</Badge>}
              </div>
              {/* The exercise's current link first (a coach may have set or
                  changed it since), then the one saved with the session. */}
              <ExerciseVideo
                name={entryName(entry, exById, lang)}
                matchNames={[exercises.find((x) => x.id === entry.exerciseId)?.name, entry.nameEn]}
                videoUrl={exercises.find((x) => x.id === entry.exerciseId)?.video_url || entry.videoUrl}
                className="text-xs shrink-0"
              />
            </div>
            <div>
              {(entry.sets || []).map((s, j) => (
                <div
                  key={j}
                  className={`flex items-center gap-3 min-h-[44px] px-4 border-t border-white/[0.06] text-[15px] tabular-nums ${isWarmup(s) ? 'text-chalkdim' : ''}`}
                >
                  {/* Warm-ups read "W" and sit muted; working sets count from 1. */}
                  <span className="w-6 shrink-0 text-chalkdim text-[13px]">{isWarmup(s) ? t('sessionCard.warmupShort') : ++n}</span>
                  <span className="flex-1 min-w-0">{formatSet(entry, s, t)}</span>
                  {j === prIdx && (
                    <span className="shrink-0 rounded-full bg-accentsoft text-accent text-xs font-semibold px-2 py-0.5">
                      {t('sessionCard.prBadge')}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {entry.category === 'cardio' && (entry.sets || []).length > 0 && (
              <p className="num text-sm px-4 py-3 border-t border-white/[0.06]">
                <span className="text-chalkdim">{t('sessionDetail.cardioTotal')}: </span>
                <CardioTotals sets={entry.sets} unit={entry.unit} minLabel={t('sessionCard.minUnit')} />
              </p>
            )}
            {entry.notes && <p className="text-chalkdim text-sm px-4 py-3 border-t border-white/[0.06]">{entry.notes}</p>}
          </section>
        )
      })}

      <Button variant="danger" onClick={remove} className="self-center mt-2">
        <Trash2 size={15} /> {t('common.delete')}
      </Button>
    </div>
  )
}

function TrainerComment({ session, effectiveUid, isAdmin, onSaved, t }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(session.trainer_comment || '')
  const [saving, setSaving] = useState(false)
  const { toast } = useFeedback()

  // Nothing to show and nobody who can add anything — render nothing at all.
  if (!session.trainer_comment && !isAdmin) return null

  async function save() {
    setSaving(true)
    try {
      await updateTrainerComment(effectiveUid, session.id, text)
      onSaved?.()
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="eyebrow flex items-center gap-1.5">
          <MessageSquareText size={13} /> {t('sessionDetail.trainerFeedback')}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('sessionDetail.feedbackPlaceholder')}
          rows={3}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="brass" onClick={save} disabled={saving}>
            {saving ? t('common.saving') : (
              <>
                <Check size={15} /> {t('common.save')}
              </>
            )}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <MessageSquareText size={15} className="text-chalkdim shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="eyebrow inline-flex items-center gap-1.5 flex-wrap">
            {t('sessionDetail.trainerFeedback')}
            <InfoTip text={t('sessionDetail.feedbackVisibilityTip')} />
          </span>
          <p className="text-[15px] mt-0.5">
            {session.trainer_comment || <span className="text-chalkdim">{t('sessionDetail.noFeedbackYet')}</span>}
          </p>
        </div>
      </div>
      {isAdmin && (
        <button onClick={() => setEditing(true)} aria-label={t('common.edit')} className="text-chalkdim hover:text-chalk shrink-0 min-w-[44px] min-h-[44px] -m-2 inline-flex items-center justify-center">
          <Pencil size={14} />
        </button>
      )}
    </Card>
  )
}
