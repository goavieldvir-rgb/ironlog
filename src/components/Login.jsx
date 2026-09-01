import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { Button, Field } from './ui.jsx'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, name)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
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
          <div className="flex mb-6 rounded-md bg-surface2 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded py-1.5 transition-colors ${mode === 'login' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 rounded py-1.5 transition-colors ${mode === 'signup' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

            {error && <p className="text-iron text-sm">{error}</p>}

            <Button type="submit" disabled={busy} className="mt-2 w-full">
              {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
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
