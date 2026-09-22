import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileSpreadsheet, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { supabase } from '../supabase.js'
import { Button, Card, Field } from './ui.jsx'

// Everything a person has in Ironlog, read fresh from the database (not
// from whatever a page happened to have loaded).
async function fetchAllData(uid) {
  const tables = ['exercises', 'routines', 'sessions', 'body_weight_logs', 'weekly_schedule']
  const results = await Promise.all(tables.map((tb) => supabase.from(tb).select('*').eq('user_id', uid)))
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', uid).single()
  if (pErr) throw pErr
  const out = { exported_at: new Date().toISOString(), profile }
  results.forEach(({ data, error }, i) => {
    // A table that doesn't exist yet (a migration not run) shouldn't block
    // exporting everything else.
    if (error) console.error(tables[i], error)
    out[tables[i]] = data || []
  })
  return out
}

function download(filename, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// One row per logged set — opens directly in Excel / Google Sheets.
function toCsv(sessions) {
  const header = [
    'date', 'routine', 'exercise', 'category', 'set', 'weight', 'unit', 'reps', 'rir',
    'duration_min', 'intensity', 'distance', 'exercise_note', 'session_note', 'workout_minutes',
  ]
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [header.join(',')]
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const s of sorted) {
    for (const e of s.entries || []) {
      ;(e.sets || []).forEach((set, i) => {
        const cardio = e.category === 'cardio'
        rows.push(
          [
            s.date, s.routine_name, e.name, e.category || 'strength', i + 1,
            cardio ? '' : set.weight, e.unit, cardio ? '' : set.reps, cardio ? '' : set.rir,
            cardio ? set.duration : '', cardio ? set.intensity : '', cardio ? set.distance : '',
            e.notes, s.notes, s.duration_minutes,
          ].map(esc).join(','),
        )
      })
    }
  }
  // The leading BOM makes Excel read Hebrew exercise names correctly
  // instead of showing garbled characters.
  return '\uFEFF' + rows.join('\n')
}

export default function Account() {
  const { user, logout } = useAuth()
  const { actingAs, isAdmin, effectiveUid, effectiveName } = useAdmin()
  const { t } = useLanguage()
  const { confirm, toast } = useFeedback()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [typed, setTyped] = useState('')

  const who = actingAs ? effectiveName : user?.displayName || user?.email
  const stamp = new Date().toISOString().slice(0, 10)

  async function exportJson() {
    setBusy('json')
    try {
      const data = await fetchAllData(effectiveUid)
      download(`ironlog-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
    } catch (err) {
      console.error(err)
      toast(t('account.exportFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function exportCsv() {
    setBusy('csv')
    try {
      const { data, error } = await supabase.from('sessions').select('*').eq('user_id', effectiveUid)
      if (error) throw error
      download(`ironlog-workouts-${stamp}.csv`, toCsv(data || []), 'text/csv;charset=utf-8')
    } catch (err) {
      console.error(err)
      toast(t('account.exportFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  // Deletion is only ever for your OWN account, never while viewing a
  // trainee — the database function enforces this too, since it only acts
  // on the signed-in user.
  const canDelete = !actingAs && !isAdmin
  const typedMatches = typed.trim().toLowerCase() === (user?.email || '').toLowerCase()

  async function deleteAccount() {
    const ok = await confirm({
      title: t('account.deleteFinalTitle'),
      body: t('account.deleteFinalBody'),
      confirmLabel: t('account.deleteFinalConfirm'),
      danger: true,
    })
    if (!ok) return
    setBusy('delete')
    try {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      await logout()
      navigate('/')
    } catch (err) {
      console.error(err)
      toast(t('account.deleteFailed'), 'error')
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1">{t('account.eyebrow')}</div>
        <h1 className="text-3xl">{t('account.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">{who}</p>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="eyebrow">{t('account.exportTitle')}</h2>
        <p className="text-chalkdim text-sm">
          {actingAs ? t('account.exportBodyActing', { name: effectiveName }) : t('account.exportBody')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportCsv} disabled={!!busy}>
            <FileSpreadsheet size={16} /> {busy === 'csv' ? t('account.preparing') : t('account.exportCsv')}
          </Button>
          <Button variant="ghost" onClick={exportJson} disabled={!!busy}>
            <Download size={16} /> {busy === 'json' ? t('account.preparing') : t('account.exportJson')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 border-ironsoft">
        <h2 className="eyebrow text-iron">{t('account.deleteTitle')}</h2>
        {canDelete ? (
          <>
            <p className="text-chalkdim text-sm">{t('account.deleteBody')}</p>
            <Field label={t('account.typeEmail', { email: user?.email })}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" autoComplete="off" />
            </Field>
            <div>
              <Button variant="danger" onClick={deleteAccount} disabled={!typedMatches || !!busy}>
                <Trash2 size={16} /> {busy === 'delete' ? t('account.deleting') : t('account.deleteButton')}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-chalkdim text-sm">{actingAs ? t('account.deleteNotWhileActing') : t('account.deleteAdminBlocked')}</p>
        )}
      </Card>
    </div>
  )
}
