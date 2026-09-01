import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { supabase } from './supabase.js'
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
import Stats from './components/Stats.jsx'
import ResetPassword from './components/ResetPassword.jsx'

export default function App() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [pendingReset, setPendingReset] = useState(false)

  // Password-reset links land here as ?code=... (a query param, which is
  // unaffected by HashRouter's use of the URL fragment for routing). Once
  // exchanged for a session, AuthContext's user updates and we hop over to
  // the reset-password screen.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) return
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) setPendingReset(true)
    })
  }, [])

  useEffect(() => {
    if (user && pendingReset) {
      navigate('/reset-password')
      setPendingReset(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingReset])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="eyebrow animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!user) return <Login />

  return (
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
        <Route path="/stats" element={<Stats />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
