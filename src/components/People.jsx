import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Users, ArrowRight, ShieldCheck, UserPlus, Copy, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { Card, Badge, EmptyState, Button, Field } from './ui.jsx'

export default function People() {
  const { user } = useAuth()
  const { setActingAs } = useAdmin()
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)

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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Admin</div>
          <h1 className="text-3xl">People</h1>
          <p className="text-chalkdim text-sm mt-1">
            Pick someone to build routines for, or view their training history.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/errors">
            <Button variant="ghost">
              <AlertTriangle size={16} /> Error logs
            </Button>
          </Link>
          <Button variant="brass" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Invite someone
          </Button>
        </div>
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

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  )
}

function InviteModal({ onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)

  const link = (() => {
    const base = window.location.origin + window.location.pathname
    const params = new URLSearchParams()
    if (name) params.set('invite_name', name)
    if (email) params.set('invite_email', email)
    const query = params.toString()
    return `${base}${query ? `?${query}` : ''}#/`
  })()

  const message = `Hey${name ? ` ${name}` : ''}! I set you up on Ironlog, the training log I use — tap this link and just pick a password to get going: ${link}`

  async function copy(text, setCopied) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const ready = name.trim() && email.trim()

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-1">Invite someone</h2>
        <p className="text-chalkdim text-sm mb-4">
          They'll land on a sign-up form with their name and email already filled in — they just set their own password.
        </p>

        <div className="flex flex-col gap-4">
          <Field label="Their name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ido" autoFocus />
          </Field>
          <Field label="Their email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ido@example.com"
            />
          </Field>

          {ready && (
            <div className="flex flex-col gap-2 pt-2 border-t border-line">
              <Button variant="ghost" onClick={() => copy(link, setCopiedLink)}>
                {copiedLink ? <Check size={15} /> : <Copy size={15} />} {copiedLink ? 'Link copied' : 'Copy invite link'}
              </Button>
              <Button variant="brass" onClick={() => copy(message, setCopiedMessage)}>
                {copiedMessage ? <Check size={15} /> : <Copy size={15} />}
                {copiedMessage ? 'Message copied' : 'Copy ready-to-send message'}
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

export const PeopleNavIcon = Users
