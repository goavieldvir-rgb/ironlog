import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserPlus, Copy, Check, AlertTriangle, Search, Pin } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { toLocalISODate } from '../lib/dates.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { Card, Badge, EmptyState, Button, Field, LoadError } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { fetchRoster, rosterFlags, attentionScore, adherence, daysSince } from '../lib/coach.js'

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
  const today = toLocalISODate()

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
          return { ...p, flags, score: attentionScore(flags), adh: adherence(p.week_counts, p.planned_per_week) }
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
          <div className="grid grid-cols-4 gap-2">
            <Tile label={t('people.tileAttention')} value={totals.attention} onClick={() => setView('attention')} active={view === 'attention'} warn={totals.attention > 0} />
            <Tile label={t('people.tileReview')} value={totals.review} onClick={() => setView('review')} active={view === 'review'} />
            <Tile label={t('people.tileActive')} value={`${totals.active}/${trainees.length}`} />
            <Tile label={t('people.tilePrs')} value={totals.prs} />
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

      <div className="flex flex-col gap-2">
        {shown.map((p) => (
          <TraineeRow key={p.id} p={p} today={today} t={t} />
        ))}
        {trainees.length > 0 && shown.length === 0 && (
          <p className="text-chalkdim text-sm text-center py-6">{view === 'review' && !query ? t('people.nothingToReview') : t('people.noMatches')}</p>
        )}
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

function Tile({ label, value, onClick, active, warn }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`rounded-[14px] px-3 py-2.5 text-start ${onClick ? 'press' : ''} ${active ? 'bg-surface2' : 'bg-surface'}`}
    >
      <div className={`num text-xl leading-tight ${warn ? 'text-accent' : 'text-chalk'}`}>{value}</div>
      <div className="text-[11px] text-chalkdim leading-tight mt-0.5">{label}</div>
    </Tag>
  )
}

// Eight weeks of sessions as tiny bars, this week last. The plan, when there
// is one, sets the full height so a short week reads as short.
function WeekBars({ counts = [], planned }) {
  const top = Math.max(planned || 0, ...counts, 1)
  return (
    <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
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
        <span key={f.key} className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${FLAG_TONES[f.tone]}`}>
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

export const PeopleNavIcon = Users
