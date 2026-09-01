import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { Button, Card, Field } from './ui.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Use at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong — try the reset link again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">Account</div>
        <h1 className="text-3xl">Set a new password</h1>
      </div>

      <Card>
        {done ? (
          <div className="flex flex-col gap-4 text-center py-4">
            <p className="text-chalk">Password updated.</p>
            <Button onClick={() => navigate('/')}>Continue to Ironlog</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="New password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
              />
            </Field>
            {error && <p className="text-iron text-sm">{error}</p>}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
