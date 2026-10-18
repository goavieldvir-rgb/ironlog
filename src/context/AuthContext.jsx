import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isPasswordRecovery, clearPasswordRecovery } from '../supabase.js'
import { removeDeviceReminder } from '../lib/push.js'
import { clearAllDrafts } from '../lib/draft.js'
import { assurance } from '../lib/mfa.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // True while the person is signed in only through a reset-password link
  // and hasn't chosen a new password yet.
  const [recovery, setRecovery] = useState(isPasswordRecovery)
  // Two-step verification: { currentLevel, nextLevel } for this session, or
  // null while it's being read. Changes on every sign-in and code check.
  const [mfa, setMfa] = useState(null)
  const [authEvents, setAuthEvents] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setRecovery(isPasswordRecovery())
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setRecovery(isPasswordRecovery())
      setAuthEvents((n) => n + 1)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Read outside the auth callback: calling Supabase from inside it can stall.
  const refreshMfa = () =>
    assurance()
      .then(setMfa)
      .catch((err) => {
        console.error(err)
        // Unknown: carry on. Without the code the database still refuses the
        // data of anyone who has two-step on.
        setMfa({ currentLevel: 'aal1', nextLevel: 'aal1' })
      })

  useEffect(() => {
    if (!user) {
      setMfa(null)
      return
    }
    refreshMfa()
  }, [user?.id, authEvents])

  const value = {
    user: user
      ? { uid: user.id, email: user.email, displayName: user.user_metadata?.full_name || '' }
      : null,
    loading: loading || (!!user && !mfa),
    recovery,
    mfa,
    // Signed in with the password but not yet with the authenticator code.
    needsCode: !!mfa && mfa.nextLevel === 'aal2' && mfa.currentLevel !== 'aal2',
    hasTwoStep: mfa?.nextLevel === 'aal2',
    refreshMfa,
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
      clearAllDrafts()
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
