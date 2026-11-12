import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useAuth } from './AuthContext.jsx'

const AdminContext = createContext(null)

export function AdminProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [actingAs, setActingAsState] = useState(null)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setLoadingProfile(false)
      return
    }
    setLoadingProfile(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.uid)
      .single()
      .then(({ data, error }) => {
        if (error) console.error(error)
        setProfile(data || null)
        setLoadingProfile(false)
      })
  }, [user])

  useEffect(() => {
    setActingAsState(null)
  }, [user?.uid])

  // The owner is the original admin; other coaches only manage their own
  // trainees. isAdmin stays as "any coach" so coach features work for both,
  // and owner-only things (error logs, verifying shared foods) use isOwner.
  const isOwner = !!profile?.is_admin
  const isCoach = isOwner || !!profile?.is_coach
  const isAdmin = isCoach
  // Nutrition is a beta: coaches, plus trainees a coach switched on. The
  // column may not exist before the migration, which reads as off.
  const nutritionAllowed = isCoach || profile?.nutrition_enabled === true

  function setActingAs(uid, name, email) {
    setActingAsState(uid ? { uid, name, email } : null)
  }

  const value = {
    profile,
    isAdmin,
    isOwner,
    isCoach,
    nutritionAllowed,
    loadingProfile,
    actingAs,
    setActingAs,
    effectiveUid: actingAs?.uid || user?.uid,
    effectiveName: actingAs?.name || profile?.full_name || user?.email,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
