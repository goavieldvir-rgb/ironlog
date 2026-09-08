import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ArrowRight, ShieldCheck } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { Card, Badge, EmptyState } from './ui.jsx'

export default function People() {
  const { user } = useAuth()
  const { setActingAs } = useAdmin()
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('email', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setPeople(data || [])
        setLoading(false)
      })
  }, [])

  function manage(person) {
    if (person.id === user.uid) {
      setActingAs(null)
    } else {
      setActingAs(person.id, person.full_name || person.email, person.email)
    }
    navigate('/')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">Admin</div>
        <h1 className="text-3xl">People</h1>
        <p className="text-chalkdim text-sm mt-1">
          Pick someone to build routines for, or view their training history.
        </p>
      </div>

      {!loading && people.length === 0 && (
        <EmptyState title="No accounts yet" body="Once people sign up, they'll show up here." />
      )}

      <div className="flex flex-col gap-2">
        {people.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <p className="truncate min-w-0">{p.full_name || p.email}</p>
                {p.id === user.uid && <Badge>You</Badge>}
                {p.is_admin && (
                  <Badge tone="brass">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={11} /> Admin
                    </span>
                  </Badge>
                )}
              </div>
              <p className="text-chalkdim text-xs mt-0.5 truncate">{p.email}</p>
            </div>
            <button
              onClick={() => manage(p)}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm text-brass hover:underline"
            >
              {p.id === user.uid ? 'Back to my account' : 'Manage'} <ArrowRight size={14} />
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}

export const PeopleNavIcon = Users
