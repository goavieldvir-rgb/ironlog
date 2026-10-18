import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, UserPlus, Copy, Check, AlertTriangle, Search, Pin, Trophy, CalendarCheck, ChevronUp, ChevronDown } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { Card, Badge, EmptyState, Button, Field, LoadError } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { fetchRoster, fetchRecentPrs, rosterFlags, attentionScore, adherence, daysSince } from '../lib/coach.js'

// The coach's roster: who needs attention first, how each trainee is doing
// against their plan, and what is waiting for review. Tapping a trainee opens
// their coach page (PersonDetail).
export default function People() {
  const { user } = useAuth()
  const { setActingAs } = useAdmin()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)
  const [inviting, setInviting] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('attention')
  const [recentPrs, setRecentPrs] = useState([])
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
          const flags = rosterFlags(p, today)
          return { ...p, flags, score: attentionScore(flags), adh: adherence(p.week_counts, p.planned_per_week, p.created_at, today) }
        }),
    [rows, user.uid, today],
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
      if (view === 'recent') return (b.last_session || '').localeCompare(a.last_session || '') || name(a).localeCompare(name(b))
      if (view === 'attention' || view === 'review') return b.score - a.score || (b.to_review || 0) - (a.to_review || 0) || name(a).localeCompare(name(b))
      return name(a).localeCompare(name(b))
    })
  }, [trainees, query, view])

  const views = [
    ['attention', t('people.viewAttention')],
    ['review', t('people.viewReview')],
    ['recent', t('people.viewRecent')],
    ['name', t('people.viewName')],
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">{t('people.admin')}</div>
          <h1 className="text-3xl">{t('people.title')}</h1>
          <p className="text-chalkdim text-sm mt-1 flex items-center gap-1.5 flex-wrap">
            {t('people.subtitle')}
            <InfoTip text={t('people.dotTip')} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/errors">
            <Button variant="ghost">
              <AlertTriangle size={16} /> {t('people.errorLogs')}
            </Button>
          </Link>
          <Button variant="brass" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> {t('people.inviteSomeone')}
          </Button>
        </div>
      </div>

      {loadError && !rows.length && <LoadError onRetry={() => setReload((r) => r + 1)} />}

      {!loading && !loadError && trainees.length === 0 && (
        <EmptyState title={t('people.emptyTitle')} body={t('people.emptyBody')} />
      )}

      {trainees.length > 0 && (
        <>
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
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1" role="tablist">
              {views.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => setView(key)}
                  className={`press shrink-0 rounded-full px-3 min-h-9 text-xs font-medium ${
                    view === key ? 'bg-chalk text-ink' : 'bg-surface2 text-chalkdim'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-5 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:items-start">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 lg:hidden">
            {shown.map((p) => (
              <TraineeRow key={p.id} p={p} today={today} t={t} />
            ))}
          </div>
          {shown.length > 0 && <RosterTable rows={shown} today={today} t={t} />}
          {trainees.length > 0 && shown.length === 0 && (
            <p className="text-chalkdim text-sm text-center py-6">{view === 'review' && !query ? t('people.nothingToReview') : t('people.noMatches')}</p>
          )}
        </div>
        {trainees.length > 0 && <SidePanel trainees={trainees} prs={recentPrs} today={today} t={t} />}
      </div>

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

export function FlagChips({ flags, t }) {
  if (!flags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f.key} className={`text-[11px] rounded-full px-2 py-0.5 font-medium whitespace-nowrap ${FLAG_TONES[f.tone]}`}>
          {t(`people.flag.${f.key}`)(f.n)}
        </span>
      ))}
    </div>
  )
}

function TraineeRow({ p, today, t }) {
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

  return (
    <Link to={`/people/${p.id}`} className="card p-4 press-row flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className="truncate min-w-0">{p.full_name || p.email}</p>
          {p.is_admin && <Badge>{t('people.adminBadge')}</Badge>}
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
      <WeekBars counts={p.week_counts} planned={p.planned_per_week} />
      <ForwardChevron size={16} className="text-chalkdim shrink-0" />
    </Link>
  )
}

function InviteModal({ onClose, t }) {
  useScrollLock(true)
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

  const message = t('people.inviteMessage')(name, link)

  async function copy(text, setCopied) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const ready = name.trim() && email.trim()

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }} onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-1">{t('people.inviteModalTitle')}</h2>
        <p className="text-chalkdim text-sm mb-4">{t('people.inviteModalSubtitle')}</p>

        <div className="flex flex-col gap-4">
          <Field label={t('people.theirName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ido" autoFocus />
          </Field>
          <Field label={t('people.theirEmail')}>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ido@example.com"
            />
          </Field>

          {ready && (
            <div className="flex flex-col gap-2 pt-2 border-t border-line">
              <Button variant="ghost" onClick={() => copy(link, setCopiedLink)}>
                {copiedLink ? <Check size={15} /> : <Copy size={15} />} {copiedLink ? t('people.linkCopied') : t('people.copyInviteLink')}
              </Button>
              <Button variant="brass" onClick={() => copy(message, setCopiedMessage)}>
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

function RosterTable({ rows, today, t }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = COLUMNS.find((c) => c.key === sort.key)
    return [...rows].sort((a, b) => {
      const x = col.sort(a), y = col.sort(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [rows, sort])

  function toggle(key) {
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: key === 'name' ? 1 : -1 }))
  }

  return (
    <div className="hidden lg:block card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs text-chalkdim border-b border-line">
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="font-medium text-start px-3 py-3 first:ps-5 whitespace-nowrap">
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
                onClick={() => navigate(`/people/${p.id}`)}
                className="border-b border-line last:border-0 hover:bg-surface2/60 cursor-pointer align-middle"
              >
                <td className="px-3 py-3 ps-5 max-w-[200px]">
                  <Link to={`/people/${p.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-chalk">{p.full_name || p.email}</span>
                      {p.pinned_note && <span className="block truncate text-xs text-chalkdim">{p.pinned_note}</span>}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 min-w-[150px]">
                  <FlagChips flags={p.flags.filter((f) => f.key !== 'pr')} t={t} />
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
  const urgent = trainees.filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)
  const checkins = trainees
    .filter((p) => p.next_checkin)
    .sort((a, b) => a.next_checkin.localeCompare(b.next_checkin))
    .slice(0, 5)
  const nameOf = Object.fromEntries(trainees.map((p) => [p.id, p.full_name || p.email]))
  const day = (iso) => fmtDate(lang, new Date(iso), { month: 'short', day: 'numeric' })

  return (
    <aside className="hidden lg:grid grid-cols-3 gap-4 items-start 2xl:flex 2xl:flex-col">
      <Card className="flex flex-col gap-3">
        <h2 className="text-base text-chalk">{t('people.panelAttention')}</h2>
        {urgent.length === 0 ? (
          <p className="text-sm text-chalkdim">{t('people.panelAllGood')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {urgent.map((p) => (
              <li key={p.id}>
                <Link to={`/people/${p.id}`} className="block hover:opacity-80">
                  <span className="block text-sm text-chalk truncate">{p.full_name || p.email}</span>
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
