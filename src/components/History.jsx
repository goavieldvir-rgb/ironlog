import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, CalendarDays, Share2 } from 'lucide-react'
import { ForwardChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate, dateLocale } from '../lib/dates.js'
import { useCollection, hasUnreadFeedback } from '../lib/db.js'
import { sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { useGyms, sessionGymId, gymLabel } from '../lib/gyms.js'
import { EmptyState, LoadError, Button, Field, FeedbackDot } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { workingSets } from '../lib/warmup.js'
import { cardioSummary, formatDistance, toKm } from '../lib/cardio.js'

function dayParts(lang, iso) {
  const d = new Date(iso + 'T00:00:00')
  // Hebrew short weekdays come back as "יום ה׳"; the block only has room for "ה׳".
  const dow = fmtDate(lang, d, { weekday: 'short' }).replace(/^יום\s*/, '')
  return { dow, day: d.getDate() }
}

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : ''
}

function monthLabel(lang, iso) {
  const d = new Date(iso + 'T00:00:00')
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return fmtDate(lang, d, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' })
}

// Sets, minutes and volume for lifting sessions; minutes and distance for
// cardio. Each piece is left out when there is nothing to say.
// gym: the workout's gym name, only for someone who trains at several.
function sessionMeta(s, t, lang, gym) {
  const lifts = (s.entries || []).filter((e) => e.category !== 'cardio')
  const sets = lifts.reduce((n, e) => n + workingSets(e.sets).length, 0)
  const volume = lifts.reduce(
    (sum, e) =>
      e.timed
        ? sum
        : sum +
          workingSets(e.sets).reduce((v, set) => {
            const w = Number(set.weight)
            const r = Number(set.reps)
            return v + (isFinite(w) && isFinite(r) ? w * r : 0)
          }, 0),
    0,
  )
  const rawUnit = lifts.find((e) => e.unit)?.unit || 'kg'
  const unit = lang === 'he' && rawUnit === 'kg' ? 'ק״ג' : rawUnit
  const kmLabel = lang === 'he' ? 'ק״מ' : 'km'
  let km = 0
  for (const e of s.entries || []) {
    if (e.category !== 'cardio') continue
    const c = cardioSummary(e.sets)
    if (c && c.distance != null) km += toKm(c.distance, e.unit)
  }
  const parts = []
  if (gym) parts.push(gym)
  if (sets > 0) parts.push(`${sets} ${t(sets === 1 ? 'history.setLabelOne' : 'history.setsLabel')}`)
  if (s.duration_minutes) parts.push(t('workout.durationShort', { min: s.duration_minutes }))
  if (volume > 0) parts.push(`${Math.round(volume).toLocaleString(dateLocale(lang))} ${unit}`)
  if (km > 0) parts.push(`${formatDistance(km)} ${kmLabel}`)
  // Each piece is isolated left-to-right so a Hebrew unit can't reorder its number.
  return parts.map((p) => `\u2066${p}\u2069`).join(' · ')
}

// Anything logged that a share card could show; an empty workout gets no
// share button.
function hasLoggedSets(s) {
  return (s.entries || []).some((e) => workingSets(e.sets).some((x) => Number(x.weight) > 0 || Number(x.reps) > 0 || Number(x.duration) > 0))
}

// A session matches a text search if the routine name, any exercise name,
// or the session notes contain the query — so searching "bench" finds every
// session where you did a bench press, not just ones named "bench day".
function matchesQuery(session, q, t, exById, lang) {
  if (!q) return true
  const needle = q.toLowerCase()
  // Match what is displayed (current language) as well as what was stored.
  if (sessionTitle(session, t)?.toLowerCase().includes(needle)) return true
  if (session.routine_name?.toLowerCase().includes(needle)) return true
  if (session.notes?.toLowerCase().includes(needle)) return true
  // Exercises match in either language, so "bench" and "לחיצת חזה" both
  // find the same workouts whichever language they were logged in.
  return (session.entries || []).some((e) => {
    const ex = exById[e.exerciseId]
    return [entryName(e, exById, lang), e.name, e.nameEn, e.nameHe, ex?.name, ex?.name_he]
      .some((n) => n?.toLowerCase().includes(needle))
  })
}

export default function History() {
  const { effectiveUid, actingAs } = useAdmin()
  const { t, lang } = useLanguage()
  const [sessions, loading, refresh, loadError] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const { gyms, mainName, enabled: gymsOn } = useGyms(effectiveUid)
  const loadFailed = !!loadError && sessions.length === 0
  const [exercises] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const exById = useMemo(() => exerciseMap(exercises), [exercises])
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (tab !== 'all' && s.category !== tab) return false
      if (dateFrom && s.date < dateFrom) return false
      if (dateTo && s.date > dateTo) return false
      if (!matchesQuery(s, q, t, exById, lang)) return false
      return true
    })
  }, [sessions, tab, q, dateFrom, dateTo, t, exById, lang])

  const hasActiveFilters = q || dateFrom || dateTo || tab !== 'all'

  function clearFilters() {
    setQ('')
    setDateFrom('')
    setDateTo('')
    setTab('all')
  }

  const groups = useMemo(() => {
    const out = []
    const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_at || '').localeCompare(a.created_at || '')))
    for (const s of sorted) {
      const k = monthKey(s.date)
      let g = out[out.length - 1]
      if (!g || g.key !== k) {
        g = { key: k, name: monthLabel(lang, s.date), rows: [] }
        out.push(g)
      }
      g.rows.push(s)
    }
    return out
  }, [filtered, lang])

  const filterOpts = [
    { id: 'all', label: t('tabs.all') },
    { id: 'strength', label: t('tabs.strength') },
    { id: 'mobility', label: t('tabs.mobility') },
    { id: 'cardio', label: t('tabs.cardio') },
  ]

  return (
    <div className="flex flex-col gap-4 pb-[120px]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[30px] leading-9">{t('history.title')}</h1>
        <button
          type="button"
          onClick={() => setShowDateFilter((v) => !v)}
          aria-label={t('history.dateRange')}
          aria-expanded={showDateFilter}
          title={t('history.dateRange')}
          className={`press inline-flex items-center justify-center w-11 h-11 rounded-full text-chalk transition-colors ${
            showDateFilter || dateFrom || dateTo ? 'bg-surface2' : 'bg-surface'
          }`}
        >
          <CalendarDays size={20} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={20} strokeWidth={1.75} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-chalkdim/70 pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('history.searchPlaceholder')}
            className="w-full h-11 ps-11 pe-3.5 bg-surface rounded-[12px] border-0 text-[15px]"
          />
        </div>
        <InfoTip text={t('history.searchTip')} />
      </div>

      {showDateFilter && (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label={t('history.from')}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label={t('history.to')}>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
      )}

      <div role="tablist" className="grid grid-cols-4 gap-0.5 p-[3px] rounded-[12px] bg-surface">
        {filterOpts.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={tab === o.id}
            onClick={() => setTab(o.id)}
            className={`min-h-[44px] rounded-[9px] text-sm font-medium transition-colors duration-200 ${
              tab === o.id ? 'bg-[#2A2A2E] text-chalk' : 'bg-transparent text-chalkdim'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {hasActiveFilters && (
        <button onClick={clearFilters} className="self-start text-chalkdim text-sm hover:text-chalk inline-flex items-center gap-1 min-h-[44px] -my-2">
          <X size={14} /> {t('history.clearFilters')}
        </button>
      )}

      {!loading && filtered.length === 0 && sessions.length > 0 && (
        <EmptyState
          title={t('history.noMatchesTitle')}
          body={t('history.noMatchesBody')}
          action={
            <Button variant="ghost" onClick={clearFilters}>
              {t('history.clearFilters')}
            </Button>
          }
        />
      )}

      {!loading && loadFailed && <LoadError onRetry={refresh} />}

      {!loading && !loadFailed && sessions.length === 0 && (
        <EmptyState
          title={t('history.emptyTitle')}
          body={t('history.emptyBody')}
          action={
            <Link to="/routines">
              <Button variant="brass">{t('history.startSession')}</Button>
            </Link>
          }
        />
      )}

      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2 mt-1">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[15px] leading-5">{g.name}</h2>
            <span className="text-[13px] text-chalkdim">
              {g.rows.length === 1 ? t('history.sessionCountOne') : t('history.sessionCountMany', { n: g.rows.length })}
            </span>
          </div>
          <div className="bg-surface rounded-[18px] overflow-hidden">
            {g.rows.map((s, i) => {
              const { dow, day } = dayParts(lang, s.date)
              return (
                <div
                  key={s.id}
                  className={`press-row flex items-center min-h-[64px] pe-1.5 text-chalk hover:bg-surface2/50 transition-colors ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  <Link to={`/history/${s.id}`} className="flex-1 min-w-0 flex items-center gap-3.5 self-stretch ps-4 py-2 text-chalk">
                    <div className="w-[34px] shrink-0 flex flex-col items-center">
                      <span className="text-[11px] leading-[14px] text-chalkdim/70">{dow}</span>
                      <span className="text-[19px] leading-6 font-semibold tabular-nums">{day}</span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[15px] leading-5 font-medium truncate">
                        {!actingAs && hasUnreadFeedback(s) && <FeedbackDot label={t('history.newFeedback')} />}
                        {sessionTitle(s, t)}
                      </span>
                      <span className="text-[13px] leading-[18px] text-chalkdim truncate tabular-nums">{sessionMeta(s, t, lang, gymsOn ? gymLabel(sessionGymId(s, gyms), gyms, mainName, t) : null)}</span>
                    </div>
                  </Link>
                  {/* Straight to the share cards, for a workout saved without sharing. */}
                  {hasLoggedSets(s) && (
                    <Link
                      to={`/history/${s.id}/share`}
                      aria-label={t('share.openShare')}
                      title={t('share.openShare')}
                      className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full text-chalkdim hover:text-chalk"
                    >
                      <Share2 size={17} strokeWidth={1.75} />
                    </Link>
                  )}
                  <Link to={`/history/${s.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0 self-stretch inline-flex items-center pe-2">
                    <ForwardChevron size={16} strokeWidth={2} className="text-[#5E5E64]" />
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
