import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isPasswordRecovery, clearPasswordRecovery } from '../supabase.js'
import { removeDeviceReminder } from '../lib/push.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // True while the person is signed in only through a reset-password link
  // and hasn't chosen a new password yet.
  const [recovery, setRecovery] = useState(isPasswordRecovery)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setRecovery(isPasswordRecovery())
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setRecovery(isPasswordRecovery())
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const value = {
    user: user
      ? { uid: user.id, email: user.email, displayName: user.user_metadata?.full_name || '' }
      : null,
    loading,
    recovery,
    finishRecovery: () => {
      clearPasswordRecovery()
      setRecovery(false)
    },
    login: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signup: async (email, password, displayName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: displayName } },
      })
      if (error) throw error
    },
    logout: async () => {
      // Best effort, but never let a slow connection stall signing out.
      if (user) await Promise.race([removeDeviceReminder(user.id), new Promise((r) => setTimeout(r, 3000))])
      return supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
