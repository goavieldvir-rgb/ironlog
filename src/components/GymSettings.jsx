import React, { useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { useGyms, gymLabel, addGym, renameGym, deleteGym, renameMainGym } from '../lib/gyms.js'
import { Button, Card, Field } from './ui.jsx'

// The gyms someone trains at. With none added this is just a short note and
// an "Add a gym" button: nothing else in the app changes until a second gym
// exists. Adding the first one also offers to name the gym they've trained
// at so far (the main gym).
export default function GymSettings({ uid }) {
  const { t } = useLanguage()
  const { confirm, toast } = useFeedback()
  const { gyms, mainName, enabled, refresh } = useGyms(uid)
  // { id: 'main' | gym id | 'new', value, mainValue }
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
      setEditing(null)
      refresh()
    } catch (err) {
      console.error(err)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const value = editing.value.trim()
    if (editing.id === 'main') return run(() => renameMainGym(uid, value))
    if (!value) return
    if (editing.id === 'new') {
      return run(async () => {
        if (!enabled && editing.mainValue.trim()) await renameMainGym(uid, editing.mainValue)
        await addGym(uid, value)
      })
    }
    return run(() => renameGym(uid, editing.id, value))
  }

  async function remove(g) {
    const ok = await confirm({
      title: t('gyms.removeTitle', { gym: g.name }),
      body: t('gyms.removeBody', { main: gymLabel(null, gyms, mainName, t) }),
      confirmLabel: t('gyms.remove'),
      danger: true,
    })
    if (ok) run(() => deleteGym(uid, g.id))
  }

  const editor = editing && (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {editing.id === 'new' && !enabled && (
        <Field label={t('gyms.currentName')}>
          <input
            value={editing.mainValue}
            maxLength={60}
            placeholder={t('gyms.mainDefault')}
            onChange={(e) => setEditing({ ...editing, mainValue: e.target.value })}
          />
        </Field>
      )}
      <Field label={editing.id === 'new' ? t('gyms.newName') : t('gyms.name')}>
        <input
          autoFocus
          value={editing.value}
          maxLength={60}
          placeholder={editing.id === 'main' ? t('gyms.mainDefault') : ''}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || (editing.id !== 'main' && !editing.value.trim())}>
          {t('common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )

  const row = (id, name, onRemove) =>
    editing?.id === id ? (
      <li key={id}>{editor}</li>
    ) : (
      <li key={id} className="flex items-center gap-2 min-h-[44px]">
        <MapPin size={16} className="text-chalkdim shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate">{name}</span>
        <button
          type="button"
          className="press w-10 h-10 flex items-center justify-center text-chalkdim hover:text-chalk"
          aria-label={t('gyms.rename', { gym: name })}
          onClick={() => setEditing({ id, value: id === 'main' ? mainName || '' : name })}
        >
          <Pencil size={16} />
        </button>
        {onRemove && (
          <button
            type="button"
            className="press w-10 h-10 flex items-center justify-center text-chalkdim hover:text-irontext"
            aria-label={t('gyms.removeTitle', { gym: name })}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        )}
      </li>
    )

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="eyebrow">{t('gyms.title')}</h2>
      <p className="text-chalkdim text-sm">{enabled ? t('gyms.bodyOn') : t('gyms.bodyOff')}</p>
      {enabled && (
        <ul className="flex flex-col">
          {row('main', gymLabel(null, gyms, mainName, t))}
          {gyms.map((g) => row(g.id, g.name, () => remove(g)))}
        </ul>
      )}
      {editing?.id === 'new' ? (
        editor
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setEditing({ id: 'new', value: '', mainValue: mainName || '' })}>
            <Plus size={16} /> {t('gyms.add')}
          </Button>
        </div>
      )}
    </Card>
  )
}
