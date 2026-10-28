import React, { lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { useLanguage } from './context/LanguageContext.jsx'
import { useAdmin } from './context/AdminContext.jsx'
import { supabase, openedFromAuthLink, authLinkKind, authLinkExpired } from './supabase.js'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import RoutineList from './components/RoutineList.jsx'
import RoutineBuilder from './components/RoutineBuilder.jsx'
import RoutineView from './components/RoutineView.jsx'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import WorkoutSession from './components/WorkoutSession.jsx'
import History from './components/History.jsx'
import SessionDetail from './components/SessionDetail.jsx'
import SessionShare from './components/SessionShare.jsx'
import EditSession from './components/EditSession.jsx'
import ResetPassword from './components/ResetPassword.jsx'
import ConsentGate from './components/ConsentGate.jsx'
import Privacy from './components/Privacy.jsx'
import { TwoStepChallenge, TwoStepRequired } from './components/TwoStep.jsx'
import { ScreenLoader } from './components/Loading.jsx'
// Screens that aren't on the way to logging a workout load on demand, so
// launch only waits for what the first screen needs. Charts (recharts) are
// the bulk of what this keeps out.
const Nutrition = lazy(() => import('./components/Nutrition.jsx'))
const People = lazy(() => import('./components/People.jsx'))
const PersonDetail = lazy(() => import('./components/PersonDetail.jsx'))
const ErrorLogs = lazy(() => import('./components/ErrorLogs.jsx'))
const Stats = lazy(() => import('./components/Stats.jsx'))
const BodyWeight = lazy(() => import('./components/BodyWeight.jsx'))
const WeeklySummary = lazy(() => import('./components/WeeklySummary.jsx'))
const Help = lazy(() => import('./components/Help.jsx'))
const Notifications = lazy(() => import('./components/Notifications.jsx'))
const Account = lazy(() => import('./components/Account.jsx'))

export default function App() {
  const { user, loading, recovery, needsCode, hasTwoStep } = useAuth()
  const { isAdmin, profile, loadingProfile } = useAdmin()
  const { t } = useLanguage()
  const location = useLocation()
  const [linkProblem, setLinkProblem] = useState(null)

  // Supabase reads an email link's code (or its "expired" error) from the URL
  // by itself while it starts up. If that failed, say why on the login screen
  // instead of silently showing an empty form.
  useEffect(() => {
    if (!openedFromAuthLink && !authLinkKind) return
    supabase.auth.initialize().then(async ({ error }) => {
      // A link opened in a different browser than the one that asked for it
      // carries a code this browser can't use: Supabase ignores it quietly,
      // so no error, but no session either.
      const { data } = await supabase.auth.getSession()
      if (error || !data.session) setLinkProblem({ kind: authLinkKind || 'reset', expired: authLinkExpired })
      // The link has done its job; a reload shouldn't repeat the message.
      const url = new URL(window.location.href)
      for (const k of ['auth', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(k)
      if (/error/.test(url.hash)) url.hash = ''
      window.history.replaceState(null, '', url)
    })
  }, [])

  if (loading) return <ScreenLoader />

  // The privacy notice has to be readable before anyone signs in.
  if (!user && location.pathname === '/privacy') return <Privacy standalone />

  if (!user) return <Login linkProblem={linkProblem} />

  // A password alone (or a reset link) is not enough for an account with
  // two-step verification on. The database enforces this too.
  if (needsCode) return <TwoStepChallenge />

  if (loadingProfile && !profile) return <ScreenLoader />

  // The coach account sees every trainee's data, so it can't be used
  // without two-step verification.
  if (isAdmin && !hasTwoStep) return <TwoStepRequired />

  // Setting a new password has to stay reachable — someone arriving from a
  // reset link shouldn't be asked to accept terms before they can even get
  // into their account.
  const content = (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/routines" element={<RoutineList />} />
        <Route path="/routines/new" element={<RoutineBuilder />} />
        <Route path="/routines/:id" element={<RoutineView />} />
        <Route path="/routines/:id/edit" element={<RoutineBuilder />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/workout/:routineId" element={<WorkoutSession />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<SessionDetail />} />
        <Route path="/history/:id/edit" element={<EditSession />} />
        <Route path="/history/:id/share" element={<SessionShare />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<PersonDetail />} />
        <Route path="/errors" element={<ErrorLogs />} />
        <Route path="/nutrition" element={<Nutrition />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/weight" element={<BodyWeight />} />
        <Route path="/summary" element={<WeeklySummary />} />
        <Route path="/help" element={<Help />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/account" element={<Account />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )

  // Signed in from a reset link: the only place to go is choosing a new
  // password. Anything else (the dashboard, a menu link) leads back here.
  if (recovery && location.pathname !== '/reset-password') return <Navigate to="/reset-password" replace />

  if (location.pathname === '/reset-password') return content

  return <ConsentGate uid={user.uid}>{content}</ConsentGate>
}
