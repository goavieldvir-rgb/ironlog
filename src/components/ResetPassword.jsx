import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { Button, Card, Field } from './ui.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
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
      setDone(true)
    } catch (err) {
      setError(err.message || t('resetPassword.genericError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">{t('resetPassword.account')}</div>
        <h1 className="text-3xl">{t('resetPassword.title')}</h1>
      </div>

      <Card>
        {done ? (
          <div className="flex flex-col gap-4 text-center py-4">
            <p className="text-chalk">{t('resetPassword.passwordUpdated')}</p>
            <Button onClick={() => navigate('/')}>{t('resetPassword.continueToApp')}</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label={t('resetPassword.newPassword')}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
              />
            </Field>
            <Field label={t('resetPassword.confirmPassword')}>
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
              {saving ? t('resetPassword.saving') : t('resetPassword.updatePassword')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
