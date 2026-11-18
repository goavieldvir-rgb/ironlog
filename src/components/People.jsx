import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Settings, Users, UserPlus, Copy, Check, Share, AlertTriangle, Search, Pin, Trophy, CalendarCheck, ChevronUp, ChevronDown, MessageSquare, Pencil, Star, Layers } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { supabase } from '../supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Card, Badge, EmptyState, Button, Field, LoadError } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { PageLoader } from './Loading.jsx'
import CoachTasks from './CoachTasks.jsx'
import { useCoachSettings, saveCoachSettings } from '../lib/coachSettings.js'
import Tour, { useFirstTour, tourSeen, markTourSeen, COACH_NEW_TOUR } from './Tour.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { useMessagesState } from '../lib/messages.js'
import { fetchRoster, fetchRecentPrs, rosterFlags, attentionScore, adherence, daysSince, recordInvite, fetchMyCoachLimit, fetchOwnerName } from '../lib/coach.js'

// The coach's roster: who needs attention first, how each trainee is doing
// against their plan, and what is waiting for review. Tapping a trainee opens
// their coach page (PersonDetail).
export default function People() {
  const { user } = useAuth()
  const { setActingAs, isOwner, isCoach, profile } = useAdmin()
  const [coachSettings] = useCoachSettings(isCoach ? profile?.id : null)
  const behindPct = coachSettings?.settings.behind_pct ?? 60
  const tasksOff = coachSettings?.settings.tasks_off || []
  const { t } = useLanguage()
  const { toast } = useFeedback()
  // Per-trainee settings, kept per coach in coach_settings (Edit trainees):
  // - attention_off: their warning flags, Deal with first and automatic To do
  //   items are hidden; sessions to review still show.
  // - priority: starred, and shown first in every view and in Deal with first.
  const attentionAvailable = !!coachSettings?.attentionAvailable
  const [local, setLocal] = useState({})
  const offIds = useMemo(() => new Set(local.attention_off ?? coachSettings?.settings.attention_off ?? []), [local, coachSettings])
  const priorityIds = useMemo(() => new Set(local.priority ?? coachSettings?.settings.priority ?? []), [local, coachSettings])
  const [editing, setEditing] = useState(false)
  async function toggleIn(field, id) {
    if (!attentionAvailable) return
    const set = field === 'priority' ? priorityIds : offIds
    const before = [...set]
    const next = set.has(id) ? before.filter((x) => x !== id) : [...before, id]
    setLocal((l) => ({ ...l, [field]: next }))
    try {
      await saveCoachSettings(profile.id, { [field]: next })
    } catch (e) {
      console.error(e)
      setLocal((l) => ({ ...l, [field]: before }))
      toast(t('people.attentionFailed'), 'error')
    }
  }
  const toggleAttention = (id) => toggleIn('attention_off', id)
  const togglePriority = (id) => toggleIn('priority', id)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)
  // A coach's own trainee count and limit, set by the owner.
  const [myLimit, setMyLimit] = useState(null)
  const [limitLoaded, setLimitLoaded] = useState(false)
  useEffect(() => {
    if (isCoach && !isOwner)
      fetchMyCoachLimit().then((l) => {
        setMyLimit(l)
        setLimitLoaded(true)
      })
  }, [isCoach, isOwner, reload])
  const [inviting, setInviting] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('attention')
  const [recentPrs, setRecentPrs] = useState([])
  // Unread messages per trainee, kept fresh app-wide (a push or a minute on
  // screen refreshes it); stays empty before the SQL is run.
  const { byTrainee: unreadMsgs } = useMessagesState()
  const today = toLocalISODate()

  // Only the desktop side panel shows this, so it never blocks the list.
  useEffect(() => {
    fetchRecentPrs(today).then(setRecentPrs).catch((e) => console.error(e))
  }, [reload, today])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchRoster(today)
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setLoadError(null)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setLoadError(error)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [reload, today])

  const trainees = useMemo(
    () =>
      rows
        .filter((p) => p.id !== user.uid)
        .map((p) => {
          const attentionOff = offIds.has(p.id)
          let flags = rosterFlags(p, today, behindPct, tasksOff)
          if (attentionOff) flags = [...flags.filter((f) => f.key === 'review' || f.key === 'pr'), { key: 'off', tone: 'muted', score: 0 }]
          return { ...p, attentionOff, priority: priorityIds.has(p.id), unread: unreadMsgs[p.id] || 0, flags, score: attentionScore(flags), adh: adherence(p.week_counts, p.planned_per_week, p.created_at, today) }
        }),
    [rows, user.uid, today, unreadMsgs, behindPct, tasksOff, offIds, priorityIds],
  )
  const me = rows.find((p) => p.id === user.uid)

  const totals = useMemo(
    () => ({
      attention: trainees.filter((p) => p.score > 0).length,
      review: trainees.reduce((n, p) => n + (p.to_review || 0), 0),
      prs: trainees.reduce((n, p) => n + (p.prs_7d || 0), 0),
      active: trainees.filter((p) => (p.week_counts || []).at(-1) > 0).length,
      adherence: (() => {
        const planned = trainees.filter((p) => p.adh != null)
        return planned.length ? Math.round(planned.reduce((a, p) => a + p.adh, 0) / planned.length) : null
      })(),
      sessions: trainees.reduce((n, p) => n + ((p.week_counts || []).at(-1) || 0), 0),
    }),
    [trainees],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = trainees.filter((p) => !q || `${p.full_name || ''} ${p.email || ''}`.toLowerCase().includes(q))
    if (view === 'review') list = list.filter((p) => p.to_review > 0)
    const name = (p) => (p.full_name || p.email || '').toLowerCase()
    return [...list].sort((a, b) => {
      // Priority trainees come first in every view.
      if (a.priority !== b.priority) return a.priority ? -1 : 1
      if (view === 'recent') return (b.last_session || '').localeCompare(a.last_session || '') || name(a).localeCompare(name(b))
      if (view === 'attention' || view === 'review') return b.score - a.score || (b.to_review || 0) - (a.to_review || 0) || name(a).localeCompare(name(b))
      return name(a).localeCompare(name(b))
    })
  }, [trainees, query, view])

  // The coach walkthrough: once for a coach other than the owner, the first
  // time this page has loaded after they became a coach (a new coach, or an
  // existing trainee the owner made one). Home and Help can ask for it again.
  const location = useLocation()
  const navigate = useNavigate()
  const isOtherCoach = isCoach && !isOwner
  // The owner's name goes into the cards; if it can't be read, they say
  // "Ironlog's owner" instead of waiting forever.
  const [ownerName, setOwnerName] = useState(null)
  useEffect(() => {
    if (!isOtherCoach) return
    let live = true
    fetchOwnerName().then((n) => live && setOwnerName(n), () => live && setOwnerName(''))
    return () => { live = false }
  }, [isOtherCoach])
  const tourRequested = !!location.state?.coachTour
  const tourReady = isOtherCoach && !loading && limitLoaded && ownerName != null
  const [tourOpen, closeFullTour] = useFirstTour('coach', tourReady, tourRequested, { coach: true })
  // The full walkthrough already covers what's new, so finishing or
  // skipping it also counts as having seen the "what's new" one.
  const closeTour = (completed, empty) => {
    if (!empty && user) markTourSeen(user.uid, COACH_NEW_TOUR)
    closeFullTour(completed, empty)
  }
  useEffect(() => {
    if (tourOpen && tourRequested) navigate('.', { replace: true, state: null })
  }, [tourOpen, tourRequested, navigate])
  const tourSteps = coachTourSteps(t, ownerName)
  // Coaches who finished the walkthrough before Coach settings and the
  // Tracking card existed get a short "what's new" instead, once.
  const [newOpen, closeNew] = useFirstTour(COACH_NEW_TOUR, tourReady && !tourOpen && !!user && tourSeen(user.uid, 'coach'), false, { coach: true })

  const views = [
    ['attention', t('people.viewAttention')],
    ['review', t('people.viewReview')],
    ['recent', t('people.viewRecent')],
    ['name', t('people.viewName')],
  ]

  return (
    <div className="flex flex-col gap-5">
      {tourOpen && <Tour steps={tourSteps} onClose={closeTour} />}
      {newOpen && !tourOpen && <Tour steps={coachNewSteps(t)} onClose={closeNew} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div data-tour="coach-own">
          <div className="eyebrow mb-1">{t(isOwner ? 'people.admin' : 'people.coachBadge')}</div>
          <h1 className="text-3xl">{t('people.title')}</h1>
          <p className="text-chalkdim text-sm mt-1 flex items-center gap-1.5 flex-wrap">
            {t('people.subtitle')}
            <InfoTip text={t('people.dotTip')} />
          </p>
          {myLimit?.trainee_limit != null && (
            <p data-tour="coach-places" className="text-chalkdim text-sm mt-1 num">{t('people.myLimit')(myLimit.trainees, myLimit.trainee_limit)}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" to="/people/programs">
            <Layers size={16} /> {t('programs.title')}
          </Button>
          <span data-tour="coach-settings" className="contents">
            <Button variant="ghost" to="/coach-settings" aria-label={t('coachSettings.title')}>
              <Settings size={16} /> <span className="hidden sm:inline">{t('coachSettings.title')}</span>
            </Button>
          </span>
          {isOwner && (
            <Button variant="ghost" to="/errors">
              <AlertTriangle size={16} /> {t('people.errorLogs')}
            </Button>
          )}
          <span data-tour="coach-invite" className="contents">
            <Button variant="brass" onClick={() => setInviting(true)}>
              <UserPlus size={16} /> {t('people.inviteSomeone')}
            </Button>
          </span>
        </div>
      </div>

      {loadError && !rows.length && <LoadError onRetry={() => setReload((r) => r + 1)} />}

      {loading && !rows.length && !loadError && <PageLoader />}

      {!loading && !loadError && trainees.length === 0 && (
        <EmptyState title={t('people.emptyTitle')} body={t('people.emptyBody')} />
      )}

      {trainees.length > 0 && (
        <>
          <CoachTasks trainees={trainees} today={today} attentionOff={offIds} />
          <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
            <Tile label={t('people.tileAttention')} value={totals.attention} onClick={() => setView('attention')} active={view === 'attention'} warn={totals.attention > 0} />
            <Tile label={t('people.tileReview')} value={totals.review} onClick={() => setView('review')} active={view === 'review'} />
            <Tile label={t('people.tileActive')} value={`${totals.active}/${trainees.length}`} />
            <Tile label={t('people.tilePrs')} value={totals.prs} />
            <Tile className="hidden lg:block" label={t('people.tileAdherence')} value={totals.adherence != null ? `${totals.adherence}%` : '—'} />
            <Tile className="hidden lg:block" label={t('people.tileSessions')} value={totals.sessions} />
          </div>

          <div className="flex flex-col gap-2">
            {trainees.length > 5 && (
              <label className="relative block">
                <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-chalkdim pointer-events-none" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('people.searchPlaceholder')}
                  className="w-full ps-9"
                  aria-label={t('people.searchPlaceholder')}
                />
              </label>
            )}
            <div className="flex items-center gap-2">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 min-w-0 flex-1">
              {views.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`press shrink-0 rounded-full px-3 min-h-9 text-xs font-medium ${
                    view === key ? 'bg-chalk text-ink' : 'bg-surface2 text-chalkdim'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
              <button
                type="button"
                data-shot="edit-attention"
                aria-pressed={editing}
                onClick={() => setEditing((e) => !e)}
                className={`press shrink-0 rounded-full px-3 min-h-9 text-xs font-medium inline-flex items-center gap-1.5 ${
                  editing ? 'bg-chalk text-ink' : 'bg-surface2 text-chalkdim'
                }`}
              >
                {editing ? <Check size={14} /> : <Pencil size={14} />}
                {editing ? t('people.attentionDone') : t('people.attentionEdit')}
              </button>
            </div>
            {editing && (
              <p className="text-xs text-chalkdim">
                {attentionAvailable ? t('people.attentionHint') : t('people.attentionNotReady')}
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 lg:hidden">
            {shown.map((p, i) => (
              <span key={p.id} data-tour={i === 0 ? 'coach-trainee' : undefined} className="contents">
                <TraineeRow p={p} today={today} t={t} editing={editing} canEdit={attentionAvailable} onToggle={toggleAttention} onPriority={togglePriority} />
              </span>
            ))}
          </div>
          {shown.length > 0 && (
            <span data-tour="coach-trainee" className="contents">
              <RosterTable rows={shown} today={today} t={t} editing={editing} canEdit={attentionAvailable} onToggle={toggleAttention} onPriority={togglePriority} />
            </span>
          )}
          {trainees.length > 0 && shown.length === 0 && (
            <p className="text-chalkdim text-sm text-center py-6">{view === 'review' && !query ? t('people.nothingToReview') : t('people.noMatches')}</p>
          )}
        </div>
        {trainees.length > 0 && <SidePanel trainees={trainees} prs={recentPrs} today={today} t={t} />}
      </div>

      {isOwner && <CoachesCard onChanged={() => setReload((r) => r + 1)} />}

      {me && (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <p className="truncate">{me.full_name || me.email}</p>
            <Badge>{t('people.you')}</Badge>
          </div>
          <button onClick={() => setActingAs(null)} className="shrink-0 text-sm text-chalkdim">
            {t('people.backToMyAccount')}
          </button>
        </Card>
      )}

      {inviting && <InviteModal onClose={() => setInviting(false)} t={t} />}
    </div>
  )
}

// The coach walkthrough's cards, with the owner's name filled in. Steps
// with a target light that part of this page and are skipped when it isn't
// shown (no limit set, no trainees yet); the rest are plain cards.
export function coachTourSteps(t, ownerName) {
  const owner = ownerName || t('tour.coach.ownerFallback')
  const fill = (key) => {
    const s = t(`tour.coach.${key}`)
    const f = (x) => x.replace(/\{owner\}/g, owner)
    return { eyebrow: f(s.eyebrow), title: f(s.title), body: f(s.body) }
  }
  return [
    { target: 'coach-own', ...fill('own') },
    { target: 'coach-settings', ...fill('settings') },
    { target: 'coach-invite', ...fill('invite') },
    { target: 'coach-places', ...fill('places') },
    { target: 'coach-trainee', ...fill('trainee') },
    fill('setup'),
    fill('routines'),
    fill('remove'),
    fill('owner'),
  ]
}

// The short "what's new" for coaches who had the walkthrough before Coach
// settings and the Tracking card arrived.
export function coachNewSteps(t) {
  const eyebrow = t('tour.coach.newEyebrow')
  const pick = (key) => {
    const s = t(`tour.coach.${key}`)
    return { eyebrow, title: s.title, body: s.body }
  }
  return [{ target: 'coach-settings', ...pick('settings') }, pick('setup')]
}

// Owner only: the independent coaches. Names, emails and how many trainees
// they have, never the trainees themselves.
function CoachesCard({ onChanged }) {
  const { t } = useLanguage()
  const { toast, confirm } = useFeedback()
  const [coaches, setCoaches] = useState(null)
  // The coach whose trainee limit is being edited, and the typed value.
  const [editing, setEditing] = useState(null)

  async function saveLimit(c) {
    const raw = String(editing?.value ?? '').trim()
    const limit = raw === '' ? null : Number(raw)
    if (limit != null && (!Number.isInteger(limit) || limit < 0)) {
      toast(t('people.limitInvalid'), 'error')
      return
    }
    const { error } = await supabase.rpc('set_coach_limit', { p_coach: c.id, p_limit: limit })
    if (error) {
      console.error(error)
      toast(t('people.coachError'), 'error')
      return
    }
    setEditing(null)
    toast(limit == null ? t('people.limitCleared', { name: c.name || c.email }) : t('people.limitSaved', { name: c.name || c.email, n: limit }))
    load()
  }

  async function setRemovedCoach(c, removed) {
    const name = c.name || c.email
    const ok = await confirm(
      removed
        ? { title: t('people.removeAppTitle', { name }), body: t('people.removeAppCoachBody', { name }), confirmLabel: t('people.removeApp'), danger: true }
        : { title: t('people.restoreTitle', { name }), body: t('people.restoreCoachBody', { name }), confirmLabel: t('people.restore') }
    )
    if (!ok) return
    const { error } = await supabase.rpc('set_removed', { p_person: c.id, p_removed: removed })
    if (error) {
      console.error(error)
      toast(t('people.coachError'), 'error')
      return
    }
    toast(t(removed ? 'people.removedApp' : 'people.restored', { name }))
    load()
  }

  async function load() {
    const { data, error } = await supabase.rpc('list_coaches')
    if (error) return console.error(error)
    setCoaches(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  async function setFrozen(c, frozen) {
    const name = c.name || c.email
    const ok = await confirm(
      frozen
        ? { title: t('people.freezeTitle', { name }), body: t('people.freezeBody', { name }), confirmLabel: t('people.freezeCoach'), danger: true }
        : { title: t('people.unfreezeTitle', { name }), body: t('people.unfreezeBody', { name }), confirmLabel: t('people.unfreezeCoach') }
    )
    if (!ok) return
    const { error } = await supabase.rpc('set_coach_frozen', { p_coach: c.id, p_frozen: frozen })
    if (error) {
      console.error(error)
      toast(t('people.coachError'), 'error')
      return
    }
    toast(t(frozen ? 'people.coachFrozen' : 'people.coachUnfrozen', { name }))
    load()
  }

  // Only a coach with no trainees left can stop being a coach.
  async function remove(c) {
    const name = c.name || c.email
    if (!(await confirm({ title: t('people.removeCoachTitle', { name }), body: t('people.removeCoachBody'), confirmLabel: t('people.removeCoach'), danger: true }))) return
    const { error } = await supabase.rpc('set_coach', { p_person: c.id, p_on: false })
    if (error) {
      console.error(error)
      toast(t(/COACH_HAS_TRAINEES/.test(error.message || '') ? 'people.coachHasTrainees' : 'people.coachError'), 'error')
      load()
      return
    }
    toast(t('people.coachRemoved', { name }))
    load()
    onChanged()
  }

  if (coaches == null) return null
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg">{t('people.coachesTitle')}</h2>
      {coaches.length === 0 && <p className="text-chalkdim text-sm">{t('people.coachesHint')}</p>}
      {coaches.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 py-2 border-t border-line first-of-type:border-t-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate min-w-0">{c.name || c.email}</p>
            {c.frozen && <Badge>{t('people.frozenBadge')}</Badge>}
            {c.removed && <Badge>{t('people.removedBadge')}</Badge>}
          </div>
          {c.name && <p className="text-xs text-chalkdim truncate">{c.email}</p>}
          <p className="text-xs text-chalkdim num">
            {c.trainee_limit != null ? t('people.coachTraineesOf')(c.trainees || 0, c.trainee_limit) : t('people.coachTrainees')(c.trainees || 0)}
          </p>
          {editing?.id === c.id ? (
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="w-28"
                value={editing.value}
                placeholder={t('people.limitNone')}
                aria-label={t('people.limitLabel')}
                onChange={(e) => setEditing({ id: c.id, value: e.target.value })}
              />
              <button onClick={() => saveLimit(c)} className="text-sm text-brass">{t('people.limitSave')}</button>
              <button onClick={() => setEditing(null)} className="text-sm text-chalkdim">{t('people.limitCancel')}</button>
            </div>
          ) : (
            <div className="flex gap-x-4 gap-y-1 flex-wrap mt-1">
              {!c.removed && (
                <button onClick={() => setEditing({ id: c.id, value: c.trainee_limit ?? '' })} className="text-sm text-chalkdim">
                  {t('people.limitButton')}
                </button>
              )}
              {c.frozen ? (
                <button onClick={() => setFrozen(c, false)} className="text-sm text-chalkdim">
                  {t('people.unfreezeCoach')}
                </button>
              ) : (
                c.trainees > 0 && (
                  <button onClick={() => setFrozen(c, true)} className="text-sm text-chalkdim">
                    {t('people.freezeCoach')}
                  </button>
                )
              )}
              <button onClick={() => setRemovedCoach(c, !c.removed)} className="text-sm text-chalkdim">
                {c.removed ? t('people.restore') : t('people.removeApp')}
              </button>
              {!c.trainees && (
                <button onClick={() => remove(c)} className="text-sm text-chalkdim">
                  {t('people.removeCoach')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </Card>
  )
}

function Tile({ label, value, onClick, active, warn, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`rounded-[14px] px-3 py-2.5 lg:px-4 lg:py-4 text-start ${onClick ? 'press' : ''} ${active ? 'bg-surface2' : 'bg-surface'} ${className}`}
    >
      <div className={`num text-xl lg:text-3xl leading-tight ${warn ? 'text-accent' : 'text-chalk'}`}>{value}</div>
      <div className="text-[11px] lg:text-xs text-chalkdim leading-tight mt-0.5 lg:mt-1">{label}</div>
    </Tag>
  )
}

// Eight weeks of sessions as tiny bars, this week last. The plan, when there
// is one, sets the full height so a short week reads as short.
function WeekBars({ counts = [], planned, className = 'h-7' }) {
  const top = Math.max(planned || 0, ...counts, 1)
  return (
    <div className={`flex items-end gap-[3px] ${className}`} aria-hidden="true">
      {counts.map((n, i) => (
        <span
          key={i}
          className={`w-[5px] rounded-sm ${i === counts.length - 1 ? 'bg-accent' : planned && n >= planned ? 'bg-chalk/70' : 'bg-chalkdim/40'}`}
          style={{ height: `${Math.max(n ? 18 : 6, (n / top) * 100)}%` }}
        />
      ))}
    </div>
  )
}

const FLAG_TONES = {
  warn: 'bg-accentsoft text-accent',
  accent: 'bg-surface2 text-chalk',
  good: 'bg-good/10 text-good',
  muted: 'bg-surface2 text-chalkdim',
}

export function FlagChips({ flags, t, wrap = false }) {
  if (!flags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f.key} className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${wrap ? 'leading-snug' : 'whitespace-nowrap'} ${FLAG_TONES[f.tone]}`}>
          {t(`people.flag.${f.key}`)(f.n)}
        </span>
      ))}
    </div>
  )
}

// Star: in edit mode a button that marks a trainee as priority, otherwise a
// small filled star beside a priority trainee's name.
function PriorityStar({ p, t, editing, disabled, onPriority }) {
  if (!editing) return p.priority ? <Star size={13} className="shrink-0 text-accent fill-current" aria-label={t('people.priorityBadge')} /> : null
  return (
    <button
      type="button"
      aria-pressed={!!p.priority}
      data-shot={`prio-${p.id}`}
      aria-label={t('people.prioritySwitch')(p.full_name || p.email)}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onPriority(p.id)
      }}
      className={`press shrink-0 w-9 h-9 -m-1.5 rounded-full flex items-center justify-center disabled:opacity-50 ${p.priority ? 'text-accent' : 'text-chalkdim hover:text-chalk'}`}
    >
      <Star size={18} className={p.priority ? 'fill-current' : ''} />
    </button>
  )
}

// On/off for whether a trainee shows in Needs attention.
function AttentionSwitch({ p, t, disabled, onToggle }) {
  const on = !p.attentionOff
  return (
    <button
      type="button"
      role="switch"
      data-shot={`attn-${p.id}`}
      aria-checked={on}
      aria-label={t('people.attentionSwitch')(p.full_name || p.email)}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(p.id)
      }}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ironbtn' : 'bg-surface2 ring-1 ring-inset ring-line'}`}
    >
      <span className={`absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-chalk transition-transform ${on ? 'ltr:translate-x-5 rtl:-translate-x-5' : ''}`} />
    </button>
  )
}

function TraineeRow({ p, today, t, editing, canEdit, onToggle, onPriority }) {
  const thisWeek = (p.week_counts || []).at(-1) || 0
  const quiet = daysSince(p.last_session, today)
  const dot = p.score > 0 ? 'bg-accent' : thisWeek > 0 ? 'bg-good' : p.last_session ? 'bg-chalkdim' : 'bg-chalkdim/40'
  const stats = p.last_session
    ? [
        p.planned_per_week ? t('people.weekOfPlan')(thisWeek, p.planned_per_week) : t('people.sessionThisWeek')(thisWeek),
        p.adh != null ? t('people.adherenceShort')(p.adh) : null,
        t('people.lastSession')(quiet),
      ].filter(Boolean)
    : [t('people.noSessionsYet')]

  const Row = editing ? 'div' : Link
  return (
    <Row {...(editing ? {} : { to: `/people/${p.id}` })} className={`card p-4 flex items-center gap-3 ${editing ? '' : 'press-row'}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {!editing && <PriorityStar p={p} t={t} />}
          <p className="truncate min-w-0">{p.full_name || p.email}</p>
          {p.is_admin && <Badge>{t('people.adminBadge')}</Badge>}
          {p.is_coach && <Badge>{t('people.coachBadge')}</Badge>}
          {p.removed && <Badge>{t('people.removedBadge')}</Badge>}
          {p.unread > 0 && <UnreadBadge n={p.unread} t={t} />}
        </div>
        <p className="text-xs text-chalkdim num">{stats.join(' · ')}</p>
        <FlagChips flags={p.flags} t={t} />
        {p.pinned_note && (
          <p className="text-xs text-chalkdim inline-flex items-center gap-1 min-w-0">
            <Pin size={11} className="shrink-0" />
            <span className="truncate">{p.pinned_note}</span>
          </p>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-3 shrink-0">
          <PriorityStar p={p} t={t} editing disabled={!canEdit} onPriority={onPriority} />
          <AttentionSwitch p={p} t={t} disabled={!canEdit} onToggle={onToggle} />
        </div>
      ) : (
        <>
          <WeekBars counts={p.week_counts} planned={p.planned_per_week} />
          <ForwardChevron size={16} className="text-chalkdim shrink-0" />
        </>
      )}
    </Row>
  )
}

function UnreadBadge({ n, t }) {
  return (
    <span role="img" aria-label={t('messages.unreadLabel')(n)} title={t('messages.unreadLabel')(n)} className="shrink-0 inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 font-medium bg-accent text-onaccent num">
      <MessageSquare size={11} aria-hidden="true" /> {n}
    </span>
  )
}

function InviteModal({ onClose, t }) {
  useScrollLock(true)
  const { toast } = useFeedback()
  const { profile } = useAdmin()
  const [coachSettings] = useCoachSettings(profile?.id)
  const ownText = coachSettings?.settings.invite_text?.trim()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)

  const link = (() => {
    const base = window.location.origin + window.location.pathname
    const params = new URLSearchParams()
    if (name) params.set('invite_name', name)
    if (email) params.set('invite_email', email)
    const query = params.toString()
    return `${base}${query ? `?${query}` : ''}#/`
  })()

  // The coach's own wording (Coach settings) when they wrote one.
  const message = ownText
    ? (/\{link\}/.test(ownText) ? ownText : `${ownText}\n${'{link}'}`).replace(/\{name\}/g, () => name).replace(/\{link\}/g, () => link)
    : t('people.inviteMessage')(name, link)

  // Records the invite first. Another coach's live invite for this email
  // stops here, since signing up would land them with that coach. Anything
  // else is best effort: the link still works if invite-only is off.
  async function invite() {
    try {
      await recordInvite(email)
      return true
    } catch (err) {
      console.error(err)
      if (String(err?.message || '').includes('INVITED_BY_OTHER_COACH')) {
        toast(t('people.invitedByOther'), 'error')
        return false
      }
      if (String(err?.message || '').includes('COACH_LIMIT_REACHED')) {
        toast(t('people.limitReached'), 'error')
        return false
      }
      return true
    }
  }

  async function copy(text, setCopied) {
    if (!(await invite())) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error(err)
      toast(t('people.copyFailed'), 'error')
    }
  }

  // The phone's share sheet goes straight to WhatsApp and friends, with no
  // copy-and-paste step. Only offered where the browser supports it.
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  async function share() {
    if (!(await invite())) return
    try {
      await navigator.share({ text: message })
    } catch (err) {
      // Closing the sheet is not an error worth a message.
      if (err?.name !== 'AbortError') {
        console.error(err)
        toast(t('people.copyFailed'), 'error')
      }
    }
  }

  const ready = name.trim() && email.trim()

  return (
    <div role="dialog" aria-modal="true" aria-label={t('people.inviteModalTitle')} className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-1">{t('people.inviteModalTitle')}</h2>
        <p className="text-chalkdim text-sm mb-4">{t('people.inviteModalSubtitle')}</p>

        <div className="flex flex-col gap-4">
          <Field label={t('people.theirName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('people.namePlaceholder')} autoFocus />
          </Field>
          <Field label={t('people.theirEmail')}>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('people.emailPlaceholder')}
            />
          </Field>

          {ready && (
            <div className="flex flex-col gap-2 pt-2 border-t border-line">
              {canShare && (
                <Button variant="brass" onClick={share}>
                  <Share size={15} /> {t('people.shareInvite')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => copy(link, setCopiedLink)}>
                {copiedLink ? <Check size={15} /> : <Copy size={15} />} {copiedLink ? t('people.linkCopied') : t('people.copyInviteLink')}
              </Button>
              <Button variant={canShare ? 'ghost' : 'brass'} onClick={() => copy(message, setCopiedMessage)}>
                {copiedMessage ? <Check size={15} /> : <Copy size={15} />}
                {copiedMessage ? t('people.messageCopied') : t('people.copyReadyMessage')}
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// The desktop roster: one row per trainee with the numbers a coach scans
// across the whole team. Column headers sort; a row opens the coach page.
const COLUMNS = [
  { key: 'name', sort: (p) => (p.full_name || p.email || '').toLowerCase() },
  { key: 'flags', sort: (p) => p.score * 10 + (p.to_review || 0) },
  { key: 'week', sort: (p) => ((p.week_counts || []).at(-1) || 0) / (p.planned_per_week || 1) },
  { key: 'adherence', sort: (p) => p.adh ?? -1 },
  { key: 'trend' },
  { key: 'last', sort: (p) => p.last_session || '' },
  { key: 'weight', sort: (p) => (p.weight_change == null ? Infinity : Number(p.weight_change)) },
  { key: 'food', sort: (p) => (p.nutrition_enabled ? p.food_days_7 || 0 : -1) },
  { key: 'prs', sort: (p) => p.prs_30d || 0 },
]

// The pinned trainee column needs its own solid background to cover what
// scrolls under it.
const STICKY = 'sticky start-0 z-[1] bg-surface'

function RosterTable({ rows, today, t, editing, canEdit, onToggle, onPriority }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = COLUMNS.find((c) => c.key === sort.key)
    return [...rows].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1
      const x = col.sort(a), y = col.sort(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [rows, sort])

  function toggle(key) {
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: key === 'name' ? 1 : -1 }))
  }

  return (
    // The trainee column stays pinned while the rest scrolls sideways on a
    // narrow window; the scrollbar is the app's thin dark one.
    <div className="hidden lg:block card overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs text-chalkdim border-b border-line">
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={`font-medium text-start px-3 py-3 first:ps-5 whitespace-nowrap ${c.key === 'name' ? STICKY : ''}`}>
                {c.sort ? (
                  <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-chalk">
                    {t(`people.col.${c.key}`)}
                    {sort?.key === c.key && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </button>
                ) : (
                  t(`people.col.${c.key}`)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const thisWeek = (p.week_counts || []).at(-1) || 0
            const quiet = daysSince(p.last_session, today)
            const dot = p.score > 0 ? 'bg-accent' : thisWeek > 0 ? 'bg-good' : p.last_session ? 'bg-chalkdim' : 'bg-chalkdim/40'
            const change = p.weight_change != null ? Number(p.weight_change) : null
            return (
              <tr
                key={p.id}
                onClick={() => (editing ? canEdit && onToggle(p.id) : navigate(`/people/${p.id}`))}
                className="group border-b border-line last:border-0 hover:bg-surface2/60 cursor-pointer align-middle"
              >
                <td className={`px-3 py-3 ps-5 max-w-[220px] ${STICKY} group-hover:bg-[#1A1A1D]`}>
                  <Link to={`/people/${p.id}`} onClick={(e) => (editing ? e.preventDefault() : e.stopPropagation())} className="flex items-center gap-2.5 min-w-0">
                    {editing ? (
                      <>
                        <AttentionSwitch p={p} t={t} disabled={!canEdit} onToggle={onToggle} />
                        <PriorityStar p={p} t={t} editing disabled={!canEdit} onPriority={onPriority} />
                      </>
                    ) : (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0 text-chalk">
                        {!editing && <PriorityStar p={p} t={t} />}
                        <span className="truncate">{p.full_name || p.email}</span>
                      </span>
                      {p.pinned_note && <span className="block truncate text-xs text-chalkdim">{p.pinned_note}</span>}
                    </span>
                    {p.unread > 0 && <UnreadBadge n={p.unread} t={t} />}
                  </Link>
                </td>
                <td className="px-3 py-3 min-w-[150px] max-w-[210px]">
                  <FlagChips flags={p.flags.filter((f) => f.key !== 'pr')} t={t} wrap />
                </td>
                <td className="px-3 py-3 num whitespace-nowrap">
                  {p.planned_per_week ? (
                    <span className={thisWeek >= p.planned_per_week ? 'text-good' : 'text-chalk'}>
                      {thisWeek}<span className="text-chalkdim">/{p.planned_per_week}</span>
                    </span>
                  ) : (
                    <span className="text-chalk">{thisWeek}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {p.adh != null ? (
                    <div className="flex items-center gap-2 min-w-[90px]">
                      <div className="h-1.5 flex-1 rounded-full bg-surface2 overflow-hidden">
                        <div className={`h-full rounded-full ${p.adh < 60 ? 'bg-accent' : 'bg-chalkdim'}`} style={{ width: `${p.adh}%` }} />
                      </div>
                      <span className={`num text-xs w-9 text-end ${p.adh < 60 ? 'text-accent' : 'text-chalk'}`}>{p.adh}%</span>
                    </div>
                  ) : (
                    <span className="text-chalkdim text-xs">{t('people.noPlanShort')}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <WeekBars counts={p.week_counts} planned={p.planned_per_week} className="h-6" />
                </td>
                <td className={`px-3 py-3 num whitespace-nowrap text-xs ${p.flags.some((f) => f.key === 'quiet') ? 'text-accent' : 'text-chalkdim'}`}>
                  {p.last_session ? t('person.daysAgoShort')(quiet) : '—'}
                </td>
                <td className="px-3 py-3 num whitespace-nowrap text-xs">
                  {p.last_weight != null ? (
                    <span dir="ltr">
                      <span className="text-chalk">{Number(p.last_weight)}{p.weight_unit}</span>
                      {change != null && change !== 0 && (
                        <span className="text-chalkdim"> {'⁦'}{change > 0 ? '+' : ''}{Math.round(change * 10) / 10}{'⁩'}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-chalkdim">—</span>
                  )}
                </td>
                <td className="px-3 py-3 num whitespace-nowrap text-xs">
                  {p.nutrition_enabled ? (
                    <span dir="ltr" className={(p.food_days_7 || 0) < 3 ? 'text-accent' : 'text-chalk'}>
                      {p.food_days_7 || 0}/7
                      {p.kcal_avg_7 != null && p.kcal_target ? (
                        <span className="text-chalkdim"> · {Math.round((p.kcal_avg_7 / p.kcal_target) * 100)}%</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-chalkdim">—</span>
                  )}
                </td>
                <td className="px-3 py-3 pe-5 num text-xs text-chalk">{p.prs_30d || <span className="text-chalkdim">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Desktop only: who to deal with first, check-ins coming up and the week's
// records across the team.
function SidePanel({ trainees, prs, today, t }) {
  const { lang } = useLanguage()
  const urgent = trainees.filter((p) => p.score > 0).sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || b.score - a.score).slice(0, 6)
  const checkins = trainees
    .filter((p) => p.next_checkin)
    .sort((a, b) => a.next_checkin.localeCompare(b.next_checkin))
    .slice(0, 5)
  const nameOf = Object.fromEntries(trainees.map((p) => [p.id, p.full_name || p.email]))
  const day = (iso) => fmtDate(lang, new Date(iso), { month: 'short', day: 'numeric' })

  return (
    <aside className="hidden lg:grid grid-cols-3 gap-4 items-start">
      <Card className="flex flex-col gap-3">
        <h2 className="text-base text-chalk">{t('people.panelAttention')}</h2>
        {urgent.length === 0 ? (
          <p className="text-sm text-chalkdim">{t('people.panelAllGood')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {urgent.map((p) => (
              <li key={p.id}>
                <Link to={`/people/${p.id}`} className="block hover:opacity-80">
                  <span className="flex items-center gap-1.5 text-sm text-chalk min-w-0">
                    <PriorityStar p={p} t={t} />
                    <span className="truncate">{p.full_name || p.email}</span>
                  </span>
                  <span className="block text-xs text-accent truncate">
                    {p.flags.filter((f) => f.tone === 'warn').map((f) => t(`people.flag.${f.key}`)(f.n)).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {checkins.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base text-chalk inline-flex items-center gap-2">
            <CalendarCheck size={15} className="text-chalkdim" /> {t('people.panelCheckins')}
          </h2>
          <ul className="flex flex-col gap-2">
            {checkins.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/people/${p.id}`} className="truncate hover:opacity-80">{p.full_name || p.email}</Link>
                <span className={`num text-xs shrink-0 ${p.next_checkin <= today ? 'text-accent' : 'text-chalkdim'}`}>
                  {day(p.next_checkin + 'T00:00:00')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-base text-chalk inline-flex items-center gap-2">
          <Trophy size={15} className="text-accent" /> {t('people.panelPrs')}
        </h2>
        {prs.length === 0 ? (
          <p className="text-sm text-chalkdim">{t('people.panelNoPrs')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {prs.slice(0, 8).map((r, i) => (
              <li key={i} className="text-sm min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to={`/people/${r.trainee_id}`} className="truncate text-chalk hover:opacity-80">{nameOf[r.trainee_id] || '—'}</Link>
                  <span className="num text-xs text-chalkdim shrink-0">{day(r.sent_at)}</span>
                </div>
                <p className="text-xs text-chalkdim truncate">{r.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  )
}

export const PeopleNavIcon = Users
