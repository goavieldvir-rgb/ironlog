import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useAuth } from './AuthContext.jsx'

const AdminContext = createContext(null)

export function AdminProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [actingAs, setActingAsState] = useState(null) // { uid, name, email } | null

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

  // Drop "acting as" whenever the logged-in user changes (e.g. logout/login).
  useEffect(() => {
    setActingAsState(null)
  }, [user?.uid])

  const isAdmin = !!profile?.is_admin

  function setActingAs(uid, name, email) {
    setActingAsState(uid ? { uid, name, email } : null)
  }

  const value = {
    profile,
    isAdmin,
    loadingProfile,
    actingAs,
    setActingAs,
    // The uid whose data should actually be read/written right now.
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
