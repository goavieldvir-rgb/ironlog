import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../supabase.js'
import { Button, Field } from './ui.jsx'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [invited, setInvited] = useState(false)

  // A link generated from People → "Invite someone" pre-fills the sign-up
  // form so whoever opens it just needs to pick a password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteEmail = params.get('invite_email')
    const inviteName = params.get('invite_name')
    if (inviteEmail || inviteName) {
      setMode('signup')
      setInvited(true)
      if (inviteEmail) setEmail(inviteEmail)
      if (inviteName) setName(inviteName)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else if (mode === 'signup') {
        await signup(email, password, name)
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        })
        if (error) throw error
        setResetSent(true)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setResetSent(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="eyebrow mb-2">Ironlog</div>
          <h1 className="text-4xl tracking-wide">Train. Log. Progress.</h1>
          <p className="text-chalkdim text-sm mt-2">
            Your own private training log — sets, reps, weight and mobility work in one place.
          </p>
        </div>

        <div className="card p-6">
          {mode !== 'reset' && (
            <div className="flex mb-6 rounded-md bg-surface2 p-1 text-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 rounded py-1.5 transition-colors ${mode === 'login' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 rounded py-1.5 transition-colors ${mode === 'signup' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                Create account
              </button>
            </div>
          )}

          {mode === 'reset' && resetSent ? (
            <div className="flex flex-col gap-4 text-center py-2">
              <p className="text-chalk">Check your email for a reset link.</p>
              <p className="text-chalkdim text-sm">Sent to {email}</p>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-brass text-sm hover:underline w-fit mx-auto"
              >
                Back to log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'reset' && (
                <div>
                  <h2 className="text-xl mb-1">Reset your password</h2>
                  <p className="text-chalkdim text-sm">We'll email you a link to set a new one.</p>
                </div>
              )}

              {mode === 'signup' && invited && (
                <p className="text-brass text-sm -mt-2">You've been invited — just pick a password to finish.</p>
              )}

              {mode === 'signup' && (
                <Field label="Name">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" required />
                </Field>
              )}

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>

              {mode !== 'reset' && (
                <Field label="Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                </Field>
              )}

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-chalkdim text-xs hover:text-brass w-fit -mt-1"
                >
                  Forgot password?
                </button>
              )}

              {error && <p className="text-iron text-sm">{error}</p>}

              <Button type="submit" disabled={busy} className="mt-2 w-full">
                {busy
                  ? 'One moment…'
                  : mode === 'login'
                    ? 'Log in'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Send reset link'}
              </Button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-chalkdim text-xs hover:text-chalk w-fit mx-auto"
                >
                  Back to log in
                </button>
              )}
            </form>
          )}
        </div>

        <p className="text-chalkdim text-xs text-center mt-6">
          Each account only ever sees its own training history.
        </p>
      </div>
    </div>
  )
}

function friendlyError(err) {
  const msg = err?.message || ''
  if (msg.includes('Invalid login credentials')) {
    return "That email/password combination doesn't match an account."
  }
  if (msg.includes('User already registered')) {
    return 'An account with that email already exists — log in instead.'
  }
  if (msg.includes('Password should be')) return 'Use at least 6 characters for your password.'
  if (msg.includes('Unable to validate email')) return 'That email address looks off.'
  return msg || 'Something went wrong. Please try again.'
}
