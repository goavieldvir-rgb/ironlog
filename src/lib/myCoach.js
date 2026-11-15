import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

// The signed-in trainee's coach, fetched once per user: { name, contact,
// isOwner }, or null when signed out, on error or when there is no row.
// undefined while it loads, so the consent screen never hashes the owner's
// wording for someone whose coach is somebody else.
export function useMyCoach() {
  const { user } = useAuth()
  const uid = user?.uid
  const [state, setState] = useState({ uid: null, coach: null })

  useEffect(() => {
    if (!uid) return
    let live = true
    supabase.rpc('my_coach').then(({ data, error }) => {
      if (!live) return
      if (error) console.error(error)
      const row = Array.isArray(data) ? data[0] : data
      setState({
        uid,
        coach: !error && row ? { name: row.name, contact: row.contact, isOwner: !!row.is_owner } : null,
      })
    })
    return () => {
      live = false
    }
  }, [uid])

  if (!uid) return null
  return state.uid === uid ? state.coach : undefined
}
