import React, { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackChevron } from './DirectionalIcon.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCollection } from '../lib/db.js'
import { LoadError } from './ui.jsx'
import { sessionTitle, entryName, exerciseMap } from '../lib/names.js'
import { useGyms, sessionGymId } from '../lib/gyms.js'
import { applyCurrentTimed } from '../lib/timed.js'
import { buildSummary } from '../lib/shareSummary.js'
import { recordBaseline } from '../lib/records.js'
import { weeklyStreak } from '../lib/streak.js'
import { preloadShareFonts } from '../lib/shareCard.js'
import WorkoutDone from './WorkoutDone.jsx'

// Saved before `session`: an earlier day, or earlier the same day.
function isEarlier(o, session) {
  return o.date < session.date || (o.date === session.date && (o.created_at || '') < (session.created_at || ''))
}

// The share screen for a workout that is already saved, opened from History.
// It rebuilds the same recap the workout screen makes on Finish, as it stood
// that day: records count against the workouts saved before it (at the same
// gym, for someone with several) and the streak runs back from its week.
export default function SessionShare() {
  const { effectiveUid } = useAdmin()
  const { t, lang } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [rawSessions, loading, refresh, loadError] = useCollection(effectiveUid, 'sessions', 'date', 'desc')
  const [exercises, exercisesLoading] = useCollection(effectiveUid, 'exercises', 'name', 'asc')
  const sessions = useMemo(() => applyCurrentTimed(rawSessions, exercises), [rawSessions, exercises])
  const { gyms, enabled: gymsOn, loading: gymsLoading } = useGyms(effectiveUid)
  const session = sessions.find((s) => s.id === id)

  useEffect(() => {
    preloadShareFonts()
  }, [])

  const summary = useMemo(() => {
    // Wait for everything, so the cards are drawn once and not again a moment later.
    if (!session || loading || exercisesLoading || gymsLoading) return null
    try {
      const here = gymsOn ? sessionGymId(session, gyms) : null
      const earlier = sessions.filter((o) => o.id !== session.id && isEarlier(o, session) && (!gymsOn || sessionGymId(o, gyms) === here))
      const { personalBests, pastStrengthSets } = recordBaseline(earlier)
      const exById = exerciseMap(exercises)
      const built = buildSummary({
        entries: (session.entries || []).map((e) => ({ ...e, name: entryName(e, exById, lang) })),
        personalBests,
        pastSets: pastStrengthSets,
        routineName: sessionTitle(session, t),
        date: session.date,
        durationMinutes: session.duration_minutes,
        streakWeeks: weeklyStreak(sessions.filter((o) => o.id !== session.id && o.date <= session.date), session.date),
        minLabel: t('sessionCard.minUnit'),
        bwLabel: t('sessionCard.bwShort'),
      })
      return built.rows.length ? built : false
    } catch (err) {
      console.error(err)
      return false
    }
    // t follows lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessions, exercises, gyms, gymsOn, loading, exercisesLoading, gymsLoading, lang])

  if (!loading && !session && loadError) return <LoadError onRetry={refresh} />
  if (!loading && !session) return <p className="text-chalkdim">{t('sessionDetail.notFound')}</p>
  if (!session || summary === null) return null

  if (summary === false) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <Link to={`/history/${session.id}`} className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit min-h-[44px] -mb-3">
          <BackChevron size={16} /> {t('share.back')}
        </Link>
        <p className="text-chalkdim">{t('share.nothingToShare')}</p>
      </div>
    )
  }

  // Back to wherever it was opened from (History or the workout), or History
  // when the link was opened on its own.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/history', { replace: true }))
  return (
    <div className="pb-[120px]">
      <WorkoutDone summary={summary} fromHistory onDone={back} />
    </div>
  )
}
