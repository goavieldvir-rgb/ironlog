import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Users, ShieldCheck, UserPlus, Copy, Check, AlertTriangle } from 'lucide-react'
import { ForwardArrow } from './DirectionalIcon.jsx'
import { supabase } from '../supabase.js'
import { toLocalISODate } from '../lib/dates.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { Card, Badge, EmptyState, Button, Field } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useScrollLock } from '../lib/scrollLock.js'

function startOfWeekISO() {
  const d = new Date()
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  return toLocalISODate(d)
}

export default function People() {
  const { user } = useAuth()
  const { setActingAs } = useAdmin()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [activity, setActivity] = useState([])

  function daysAgo(iso) {
    const days = Math.round((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000)
    if (days === 0) return t('people.today')
    if (days === 1) return t('people.yesterday')
    return t('people.daysAgo')(days)
  }

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('email', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setPeople(data || [])
        setLoading(false)
      })

    // Lightweight: just user_id + date, last 90 days, across everyone —
    // RLS lets an admin read every row, this is what makes "who's gone
    // quiet" possible without opening each person's account individually.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    supabase
      .from('sessions')
      .select('user_id, date')
      .gte('date', toLocalISODate(cutoff))
      .then(({ data, error }) => {
        if (error) console.error(error)
        setActivity(data || [])
      })
  }, [])

  const activityByUser = useMemo(() => {
    const weekStart = startOfWeekISO()
    const map = {}
    for (const row of activity) {
      if (!map[row.user_id]) map[row.user_id] = { thisWeek: 0, lastDate: null }
      if (row.date >= weekStart) map[row.user_id].thisWeek += 1
      if (!map[row.user_id].lastDate || row.date > map[row.user_id].lastDate) {
        map[row.user_id].lastDate = row.date
      }
    }
    return map
  }, [activity])

  function manage(person) {
    if (person.id === user.uid) {
      setActingAs(null)
    } else {
      setActingAs(person.id, person.full_name || person.email, person.email)
    }
    navigate('/')
  }

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

      {!loading && people.length === 0 && (
        <EmptyState title={t('people.emptyTitle')} body={t('people.emptyBody')} />
      )}

      <div className="flex flex-col gap-2">
        {people.map((p) => {
          const stats = activityByUser[p.id]
          const dotColor = stats?.thisWeek > 0 ? 'bg-good' : stats?.lastDate ? 'bg-brass' : 'bg-chalkdim'
          const activityText = stats?.thisWeek > 0
            ? t('people.sessionThisWeek')(stats.thisWeek)
            : stats?.lastDate
              ? t('people.quietSince')(daysAgo(stats.lastDate))
              : t('people.noSessionsYet')
          return (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <p className="truncate min-w-0">{p.full_name || p.email}</p>
                  {p.id === user.uid && <Badge>{t('people.you')}</Badge>}
                  {p.is_admin && (
                    <Badge tone="brass">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck size={11} /> {t('people.adminBadge')}
                      </span>
                    </Badge>
                  )}
                </div>
                <p className="text-chalkdim text-xs mt-0.5 truncate">{p.email}</p>
                {p.id !== user.uid && (
                  <p className="text-xs mt-1 inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                    <span className="text-chalkdim">{activityText}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => manage(p)}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm text-brass hover:underline"
              >
                {p.id === user.uid ? t('people.backToMyAccount') : t('people.manage')} <ForwardArrow size={14} />
              </button>
            </Card>
          )
        })}
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} t={t} />}
    </div>
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
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
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
