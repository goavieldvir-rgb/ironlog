import React, { useMemo, useState } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { useGlobalExercises } from '../lib/db.js'
import { disambiguateLabels } from '../lib/disambiguate.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { Button, CategoryTag, Badge } from './ui.jsx'

export default function ExercisePicker({ existingNames, onAdd, onCreateCustom, onClose, lockCategory }) {
  const { t, lang } = useLanguage()
  const [globalExercises, loading] = useGlobalExercises()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(lockCategory || 'all')
  const [addedIds, setAddedIds] = useState(new Set())

  // The shared library stores an optional Hebrew name (name_he) alongside
  // the English one. Falls back to English for any exercise that doesn't
  // have a Hebrew name yet, rather than showing a blank.
  function displayName(g) {
    return lang === 'he' && g.name_he ? g.name_he : g.name
  }

  const existingLower = useMemo(() => new Set(existingNames.map((n) => n.toLowerCase())), [existingNames])

  const filtered = useMemo(() => {
    return globalExercises
      .filter((g) => {
        const effectiveTab = lockCategory || tab
        if (effectiveTab !== 'all' && g.category !== effectiveTab) return false
        if (q && !displayName(g).toLowerCase().includes(q.toLowerCase())) return false
        return true
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalExercises, tab, q, lockCategory, lang])
  const filteredLabels = useMemo(() => disambiguateLabels(filtered, displayName, t), [filtered, t, lang])

  async function handleAdd(g) {
    setAddedIds((prev) => new Set(prev).add(g.id))
    try {
      // Save under whatever name is currently displayed, so a Hebrew-mode
      // user's own exercise list reads in Hebrew too, not a mix.
      await onAdd({ ...g, name: displayName(g) })
    } catch (err) {
      setAddedIds((prev) => {
        const next = new Set(prev)
        next.delete(g.id)
        return next
      })
      throw err
    }
  }

  const categoryLabels = { strength: t('tabs.strength'), mobility: t('tabs.mobility'), cardio: t('tabs.cardio') }
  const tabOptions = [
    { id: 'all', label: t('tabs.all') },
    { id: 'strength', label: t('tabs.strength') },
    { id: 'mobility', label: t('tabs.mobility') },
    { id: 'cardio', label: t('tabs.cardio') },
  ]

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl mb-1">{t('exercises.pickerTitle')}</h2>
        <p className="text-chalkdim text-sm mb-4">
          {lockCategory ? t('exercises.pickerLockedSubtitle')(categoryLabels[lockCategory]) : t('exercises.pickerSubtitle')}
        </p>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-chalkdim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('exercises.searchPlaceholder')}
              className="w-full ps-8"
              autoFocus
            />
          </div>
        </div>

        {!lockCategory && (
          <div className="flex rounded-md bg-surface2 p-1 text-sm w-fit mb-3 flex-wrap">
            {tabOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTab(opt.id)}
                className={`px-3 py-1.5 rounded transition-colors ${tab === opt.id ? 'bg-ink text-chalk' : 'text-chalkdim'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-2 px-2 flex flex-col gap-1 min-h-[200px]">
          {loading && <p className="text-chalkdim text-sm py-4">{t('common.loading')}</p>}
          {!loading && filtered.length === 0 && <p className="text-chalkdim text-sm py-4">{t('exercises.noMatches')}</p>}
          {filtered.map((g, i) => {
            const already = existingLower.has(displayName(g).toLowerCase()) || existingLower.has(g.name.toLowerCase()) || addedIds.has(g.id)
            return (
              <div key={g.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-surface2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate min-w-0">{filteredLabels[i]}</span>
                  <CategoryTag category={g.category} />
                  {g.bodyweight && g.category !== 'cardio' && <Badge tone="brass">{t('sessionCard.bwShort')}</Badge>}
                </div>
                <button
                  onClick={() => !already && handleAdd(g)}
                  disabled={already}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                    already ? 'text-good' : 'text-brass hover:bg-brasssoft'
                  }`}
                >
                  {already ? (
                    <>
                      <Check size={13} /> {t('exercises.added')}
                    </>
                  ) : (
                    <>
                      <Plus size={13} /> {t('common.add')}
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 justify-between items-center mt-4 pt-4 border-t border-line">
          <button onClick={onCreateCustom} className="text-brass text-sm hover:underline">
            {t('exercises.cantFind')}
          </button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </div>
  )
}
