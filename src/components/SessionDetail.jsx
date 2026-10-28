import ExerciseVideo from './ExerciseVideo.jsx'
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Pencil, Share, MessageSquareText, Check, Trash2, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useCollection, updateTrainerComment, deleteSession, hasUnreadFeedback, markFeedbackSeen } from '../lib/db.js'
import { markSessionsReviewed } from '../lib/coach.js'
import { sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { useGyms, sessionGymId, gymLabel } from '../lib/gyms.js'
import { Card, CategoryTag, Badge, Button } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { isWarmup, workingSets } from '../lib/warmup.js'
import { formatSeconds, applyCurrentTimed } from '../lib/timed.js'
import { formatPace } from '../lib/cardio.js'
import CardioTotals from './CardioTotals.jsx'
import { sameKindSessions, matchingEntry, targetFor, entryStats, trend, sessionVolume } from '../lib/sessionCompare.js'
import { ACCENT, CHALK, CHALKDIM, MUTED, SURFACE } from '../theme.js'

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
  const [routines] = useCollection(effectiveUid, 'routines', 'created_at', 'desc')
  const exById = useMemo(() => exerciseMap(exercises), [exercises])
  const session = sessions.find((s) => s.id === id)
  const routine = routines.find((r) => r.id === session?.routine_id)
  const { gyms, mainName, enabled: gymsOn } = useGyms(effectiveUid)
  // Earlier workouts of the same routine (at the same gym, for someone with
  // several), newest first, and how many of them to lay beside this one
  // (0 = not comparing).
  const previous = useMemo(() => {
    const same = sameKindSessions(session, sessions)
    if (!gymsOn || !session) return same
    const here = sessionGymId(session, gyms)
    return same.filter((s) => sessionGymId(s, gyms) === here)
  }, [session, sessions, gymsOn, gyms])
  const [compareCount, setCompareCount] = useState(0)
  const compared = previous.slice(0, compareCount)

  // The coach opening a trainee's workout clears it from their "to review"
  // list on the People page.
  const unreviewed = isAdmin && actingAs && session && !session.reviewed_at
  useEffect(() => {
    if (unreviewed) markSessionsReviewed(effectiveUid, [session.id]).catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreviewed, session?.id])

  // The trainee opening new feedback clears its unread mark. Not when the
  // coach is looking at their account.
  const unseen = !actingAs && hasUnreadFeedback(session)
  useEffect(() => {
    if (unseen) markFeedbackSeen(effectiveUid, session.id).catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, session?.id])

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
    gymsOn ? gymLabel(sessionGymId(session, gyms), gyms, mainName, t) : null,
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
          <div className="shrink-0 flex items-center gap-2">
            <Link
              to={`/history/${session.id}/share`}
              aria-label={t('share.openShare')}
              title={t('share.openShare')}
              className="press inline-flex items-center justify-center w-11 h-11 rounded-full bg-surface text-chalk"
            >
              <Share size={16} />
            </Link>
            <Link
              to={`/history/${session.id}/edit`}
              className="press inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-surface text-sm font-medium text-chalk"
            >
              <Pencil size={14} /> {t('sessionDetail.edit')}
            </Link>
          </div>
        </div>
        <p className="text-chalkdim text-[13px] tabular-nums">{meta.join(' · ')}</p>
        <div className="mt-1">
          <CategoryTag category={session.category} />
        </div>
      </div>

      <TrainerComment session={session} effectiveUid={effectiveUid} isAdmin={isAdmin} isNew={unseen} onSaved={refresh} t={t} />

      {session.notes && <p className="text-chalkdim text-[15px] px-1">{session.notes}</p>}

      {previous.length > 0 && (
        <ComparePanel
          session={session}
          previous={previous}
          compared={compared}
          count={compareCount}
          setCount={setCompareCount}
          exById={exById}
          lang={lang}
          t={t}
        />
      )}

      {(session.entries || []).map((entry, i) => {
        const prIdx = prSetIndex(entry, session, sessions)
        const target = targetFor(entry, routine)
        const doneSets = workingSets(entry.sets).length
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
            {target && (
              <p className="flex items-center gap-1.5 flex-wrap px-4 pb-2 -mt-1 text-[13px] text-chalkdim tabular-nums">
                <Target size={13} className="shrink-0" aria-hidden="true" />
                <span>
                  {t('workout.targetLine')}{' '}
                  <bdi dir="ltr" className="text-chalk">
                    {target.sets}
                    {target.reps != null ? `×${target.reps}${entry.timed ? 's' : ''}` : ` ${t('history.setsLabel')}`}
                    {target.rir != null ? ` · RIR ${target.rir}` : ''}
                  </bdi>
                </span>
                <span aria-hidden="true">·</span>
                <span className={doneSets < target.sets ? 'text-accent' : ''}>{t('sessionDetail.setsDone')(doneSets, target.sets)}</span>
                {target.fromRoutine && <InfoTip text={t('sessionDetail.targetFromRoutineTip')} />}
              </p>
            )}
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
            {compared.length > 0 && <PreviousRows entry={entry} compared={compared} lang={lang} t={t} />}
          </section>
        )
      })}

      <Button variant="danger" onClick={remove} className="self-center mt-2">
        <Trash2 size={15} /> {t('common.delete')}
      </Button>
    </div>
  )
}

function TrainerComment({ session, effectiveUid, isAdmin, isNew, onSaved, t }) {
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
            {isNew && <span className="text-[11px] normal-case tracking-normal rounded-full px-2 py-0.5 font-semibold bg-accent/15 text-accent">{t('sessionDetail.newFeedback')}</span>}
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

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric' })
}

const fmtNum = (v) => (Math.round(Number(v) * 100) / 100).toString()

// A workout's sets for one exercise in a single short line, e.g.
// "60×10 · 60×9 · 57.5×10". Working sets only.
function compactSets(entry, t) {
  const sets = workingSets(entry.sets)
  if (entry.category === 'cardio') {
    return sets
      .map((s) => `${fmtNum(s.duration || 0)} ${t('sessionCard.minUnit')}${s.distance !== '' && s.distance != null ? ` / ${fmtNum(s.distance)}${entry.unit}` : ''}`)
      .join(' · ')
  }
  if (entry.timed) return sets.map((s) => `${Number(s.weight) > 0 ? `+${fmtNum(s.weight)}·` : ''}${formatSeconds(s.reps) || '0s'}`).join(' · ')
  if (entry.bodyweight) return sets.map((s) => `${Number(s.weight) > 0 ? `+${fmtNum(s.weight)}×` : ''}${fmtNum(s.reps || 0)}`).join(' · ')
  return sets.map((s) => `${fmtNum(s.weight || 0)}×${fmtNum(s.reps || 0)}`).join(' · ')
}

function TrendMark({ dir, t }) {
  if (!dir) return <span className="w-4 shrink-0" />
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
  const tone = dir === 'up' ? 'text-good' : dir === 'down' ? 'text-irontext' : 'text-chalkdim'
  const label = t(`sessionDetail.trend_${dir}`)
  return (
    <span role="img" aria-label={label} title={label} className={`shrink-0 inline-flex ${tone}`}>
      <Icon size={15} />
    </span>
  )
}

// Under each exercise: what the trainee did on it in the compared workouts,
// with an arrow for whether today beat that day.
function PreviousRows({ entry, compared, lang, t }) {
  const now = entryStats(entry)
  return (
    <div className="border-t border-white/[0.06] px-4 py-2 bg-white/[0.02]">
      <div className="eyebrow mb-1">{t('sessionDetail.previously')}</div>
      <ul className="flex flex-col">
        {compared.map((o) => {
          const e = matchingEntry(entry, o)
          return (
            <li key={o.id} className="flex items-center gap-3 min-h-[32px] text-[13px] tabular-nums">
              <span className="w-14 shrink-0 text-chalkdim">{shortDate(lang, o.date)}</span>
              <bdi dir="ltr" className="flex-1 min-w-0 truncate text-start" style={{ textAlign: 'start' }}>
                {e ? compactSets(e, t) : <span className="text-chalkdim">{t('sessionDetail.notDoneThen')}</span>}
              </bdi>
              {e && (
                <span className="text-chalkdim shrink-0">
                  {e.category === 'cardio' ? '' : t('sessionDetail.setsShort')(workingSets(e.sets).length)}
                </span>
              )}
              <TrendMark dir={e ? trend(now, entryStats(e)) : null} t={t} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The big picture: pick how many earlier workouts of this routine to compare
// with, then follow total volume, or one exercise's top set, across them.
function ComparePanel({ session, previous, compared, count, setCount, exById, lang, t }) {
  const options = [
    [0, t('sessionDetail.compareOff')],
    [1, t('sessionDetail.compareLast')],
    ...(previous.length > 1 ? [[Math.min(3, previous.length), t('sessionDetail.compareLastN')(Math.min(3, previous.length))]] : []),
    ...(previous.length > 3 ? [[previous.length, t('sessionDetail.compareAll')(previous.length)]] : []),
  ]
  const series = [...compared].reverse().concat(session)
  const hasVolume = series.some((s) => sessionVolume(s))
  const metrics = [
    ...(hasVolume ? [{ key: 'volume', label: t('sessionDetail.metricVolume') }] : []),
    ...(session.entries || [])
      .filter((e) => entryStats(e))
      .map((e, i) => ({ key: `e${i}`, entry: e, label: entryName(e, exById, lang) })),
  ]
  const [metricKey, setMetricKey] = useState(null)
  const metric = metrics.find((m) => m.key === metricKey) || metrics[0]

  const unitOf = (m) => {
    if (!m) return ''
    if (m.key === 'volume') return sessionVolume(session)?.unit || series.map(sessionVolume).find(Boolean)?.unit || ''
    const st = entryStats(m.entry)
    return st.kind === 'weight' ? m.entry.unit : st.kind === 'cardio' ? t('sessionCard.minUnit') : st.kind === 'timed' ? 's' : t('sessionCard.reps')
  }
  const points = metric
    ? series.map((s) => {
        let value = null
        if (metric.key === 'volume') value = sessionVolume(s)?.value ?? null
        else value = entryStats(s === session ? metric.entry : matchingEntry(metric.entry, s))?.top ?? null
        return { id: s.id, label: shortDate(lang, s.date), value, current: s === session }
      })
    : []
  const first = points.find((p) => p.value != null)
  const change = first && !first.current && points[points.length - 1].value != null ? points[points.length - 1].value - first.value : null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base text-chalk">{t('sessionDetail.compareTitle')}</h2>
        <span className="text-xs text-chalkdim">{t('sessionDetail.compareCount')(previous.length)}</span>
      </div>
      <div role="tablist" className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {options.map(([n, label]) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={count === n}
            onClick={() => setCount(n)}
            className={`press shrink-0 rounded-full px-3 min-h-9 text-xs font-medium ${count === n ? 'bg-chalk text-ink' : 'bg-surface2 text-chalkdim'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {count > 0 && metric && (
        <>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {metrics.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={m.key === metric.key}
                onClick={() => setMetricKey(m.key)}
                className={`press shrink-0 rounded-full px-3 min-h-9 text-xs font-medium max-w-[180px] truncate ${
                  m.key === metric.key ? 'bg-accentsoft text-accent' : 'bg-surface2 text-chalkdim'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-chalkdim">
            {metric.key === 'volume' ? t('sessionDetail.metricVolumeHint') : t('sessionDetail.metricTopHint')}
            {change != null && (
              <>
                {' · '}
                <span className={change > 0 ? 'text-good' : change < 0 ? 'text-irontext' : ''}>
                  <bdi dir="ltr">{`${change > 0 ? '+' : ''}${fmtNum(change)}${unitOf(metric) ? ` ${unitOf(metric)}` : ''}`}</bdi>
                </span>{' '}
                {t('sessionDetail.sinceFirst')(points.find((p) => p.value != null).label)}
              </>
            )}
          </p>
          <div className="h-40 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                <XAxis dataKey="label" stroke={CHALKDIM} fontSize={10} tickLine={false} axisLine={false} minTickGap={16} reversed={lang === 'he'} />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip
                  contentStyle={{ background: SURFACE, border: 0, borderRadius: 12, fontSize: 13 }}
                  labelStyle={{ color: CHALK }}
                  formatter={(v) => [`${fmtNum(v)} ${unitOf(metric)}`, metric.label]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={MUTED}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, payload } = props
                    if (cx == null || cy == null || payload.value == null) return <g key={payload.id} />
                    return <circle key={payload.id} cx={cx} cy={cy} r={payload.current ? 5 : 3.5} fill={payload.current ? ACCENT : CHALKDIM} />
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}
