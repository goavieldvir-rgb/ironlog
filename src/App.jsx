import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { useLanguage } from './context/LanguageContext.jsx'
import { supabase, openedFromAuthLink } from './supabase.js'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import RoutineList from './components/RoutineList.jsx'
import RoutineBuilder from './components/RoutineBuilder.jsx'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import WorkoutSession from './components/WorkoutSession.jsx'
import History from './components/History.jsx'
import SessionDetail from './components/SessionDetail.jsx'
import EditSession from './components/EditSession.jsx'
import People from './components/People.jsx'
import ErrorLogs from './components/ErrorLogs.jsx'
import Stats from './components/Stats.jsx'
import BodyWeight from './components/BodyWeight.jsx'
import WeeklySummary from './components/WeeklySummary.jsx'
import Help from './components/Help.jsx'
import Notifications from './components/Notifications.jsx'
import Account from './components/Account.jsx'
import ResetPassword from './components/ResetPassword.jsx'
import ConsentGate from './components/ConsentGate.jsx'
import Privacy from './components/Privacy.jsx'
// Admin-only beta screen: loaded on demand so trainees never download it.
const Nutrition = lazy(() => import('./components/Nutrition.jsx'))
const PersonDetail = lazy(() => import('./components/PersonDetail.jsx'))

export default function App() {
  const { user, loading, recovery } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const [resetLinkError, setResetLinkError] = useState(false)

  // Supabase reads a reset link's code (or its "expired" error) from the URL
  // by itself while it starts up. If that failed, say so on the login screen
  // instead of silently showing an empty form.
  useEffect(() => {
    if (!openedFromAuthLink) return
    supabase.auth.initialize().then(({ error }) => {
      if (error) setResetLinkError(true)
    })
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <p className="eyebrow animate-pulse">{t('common.loading')}</p>
      </div>
    )
  }

  // The privacy notice has to be readable before anyone signs in.
  if (!user && location.pathname === '/privacy') return <Privacy standalone />

  if (!user) return <Login resetLinkError={resetLinkError ? t('login.resetLinkInvalid') : ''} />

  // Setting a new password has to stay reachable — someone arriving from a
  // reset link shouldn't be asked to accept terms before they can even get
  // into their account.
  const content = (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/routines" element={<RoutineList />} />
        <Route path="/routines/new" element={<RoutineBuilder />} />
        <Route path="/routines/:id/edit" element={<RoutineBuilder />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/workout/:routineId" element={<WorkoutSession />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<SessionDetail />} />
        <Route path="/history/:id/edit" element={<EditSession />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<Suspense fallback={null}><PersonDetail /></Suspense>} />
        <Route path="/errors" element={<ErrorLogs />} />
        <Route path="/nutrition" element={<Suspense fallback={null}><Nutrition /></Suspense>} />
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
