import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { friendlyAuthError } from '../lib/authErrors.js'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Card, Field } from './ui.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user, finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError(t('resetPassword.minChars'))
      return
    }
    if (password !== confirm) {
      setError(t('resetPassword.noMatch'))
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      finishRecovery()
      setDone(true)
    } catch (err) {
      setError(friendlyAuthError(err, t, 'resetPassword.genericError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">{t('resetPassword.account')}</div>
        <h1 className="text-3xl">{t('resetPassword.title')}</h1>
        {user?.email && <p className="text-sm text-chalkdim mt-1"><bdi>{user.email}</bdi></p>}
      </div>

      <Card>
        {done ? (
          <div className="flex flex-col gap-4 text-center py-4">
            <p className="text-chalk">{t('resetPassword.passwordUpdated')}</p>
            <Button onClick={() => navigate('/')}>{t('resetPassword.continueToApp')}</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Field label={t('resetPassword.newPassword')}>
              {/* Passwords are typed left to right in both languages, eye button included. */}
              <div className="relative" dir="ltr">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full pe-12"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-chalkdim hover:text-chalk"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <Field label={t('resetPassword.confirmPassword')}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                dir="ltr"
                required
              />
            </Field>
            {error && <p role="alert" className="text-irontext text-sm">{error}</p>}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? t('resetPassword.saving') : t('resetPassword.updatePassword')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
