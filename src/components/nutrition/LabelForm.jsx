import React, { useState } from 'react'
import { AlertCircle, AlertTriangle, Check } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { Button } from '../ui.jsx'
import { createLabelFood, findFoodsByBarcode, foodName, friendlyError, parseNum, round1, sanityCheck, fmt } from '../../lib/nutrition.js'
import { MacroInputs, Name, SheetHeader, SourceLabel, useDirtyForm } from './parts.jsx'

// Add a product from its label ("new product"). Values are per 100 g or per
// serving; per-serving entries are converted to per 100 g before saving.
export default function LabelForm({ barcode: initialBarcode = '', prefill, uid, isAdmin, onBack, onClose, onSaved, onUseExisting }) {
  const { t, lang } = useLanguage()
  const scanned = !!initialBarcode
  const incomplete = scanned && prefill?.status === 'incomplete'
  const [f, setF] = useState({
    name: (incomplete && (prefill.name || prefill.brand)) || '',
    barcode: initialBarcode,
    mode: 'per100',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    serving: incomplete && prefill.servingG > 0 ? String(prefill.servingG) : '',
  })
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const [initial] = useState(f)
  useDirtyForm(Object.keys(f).some((k) => f[k] !== initial[k]))

  const perServing = f.mode === 'serving'
  // Blank carbs/fat count as 0; kcal and protein are required.
  const val = (k) => (f[k] === '' && (k === 'carbs' || k === 'fat') ? 0 : parseNum(f[k]))
  const servingG = parseNum(f.serving)
  const servingOk = Number.isFinite(servingG) && servingG > 0
  const filled = ['kcal', 'protein', 'carbs', 'fat'].every((k) => Number.isFinite(val(k)))
  // Values per 100 g, whichever way they were typed.
  const per100 = (k) => (perServing ? round1((val(k) * 100) / servingG) : val(k))
  const ready = filled && (!perServing || servingOk)
  const sanity = ready ? sanityCheck({ kcal: per100('kcal'), protein: per100('protein'), carbs: per100('carbs'), fat: per100('fat') }) : null

  async function save(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    const name = f.name.trim()
    const code = f.barcode.replace(/\s+/g, '')
    if (!name) return setError(t('nutrition.needName'))
    if (perServing && !servingOk) return setError(t('nutrition.needServing'))
    if (!filled) return setError(t('nutrition.needKcalProtein'))
    if (code && !/^\d{8,14}$/.test(code)) return setError(t('nutrition.badBarcode'))
    const vals = { kcal: per100('kcal'), protein: per100('protein'), carbs: per100('carbs'), fat: per100('fat') }
    if (Object.values(vals).some((v) => v < 0) || vals.kcal > 900 || vals.protein > 100 || vals.carbs > 100 || vals.fat > 100) {
      return setError(t('nutrition.outOfRange'))
    }
    setBusy(true)
    try {
      if (code) {
        const same = await findFoodsByBarcode(code)
        if (same.length) {
          setExisting(same[0])
          return
        }
      }
      const food = await createLabelFood({ uid, isAdmin, lang, name, barcode: code, ...vals, serving: servingOk ? servingG : 0 })
      await onSaved(food)
    } catch (err) {
      console.error(err)
      setError(friendlyError(err, t))
    } finally {
      setBusy(false)
    }
  }

  const g = t('nutrition.g')
  return (
    <>
      <SheetHeader title={t('nutrition.newProduct')} onBack={onBack} onClose={onClose} />
      <form onSubmit={save} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
          {scanned && (
            <div className="rounded-[14px] bg-surface2 p-3 flex gap-2.5 text-sm text-chalkdim">
              <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                {incomplete ? (
                  <p className="text-chalk font-medium">{t('nutrition.barcodeIncomplete', { name: prefill.name || prefill.brand || initialBarcode })}</p>
                ) : (
                  <>
                    <p className="text-chalk font-medium">{t('nutrition.barcodeNotFoundTitle')}</p>
                    <p>{t(isAdmin ? 'nutrition.barcodeNotFoundBodyAdmin' : 'nutrition.barcodeNotFoundBody')}</p>
                  </>
                )}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-chalkdim">{t('nutrition.productName')}</span>
            <input dir="auto" value={f.name} onChange={set('name')} autoFocus={!scanned} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-chalkdim">
              {t('nutrition.barcode')} {!scanned && <>({t('nutrition.barcodeOptional')})</>}
            </span>
            <input inputMode="numeric" dir="ltr" className="num" value={f.barcode} onChange={(e) => setF((s) => ({ ...s, barcode: e.target.value.replace(/[^\d]/g, '') }))} readOnly={scanned} />
          </label>
          {existing && (
            <div className="rounded-[14px] bg-surface2 p-3 flex flex-col gap-2" role="alert">
              <p className="text-sm font-medium">{t('nutrition.existsTitle')}</p>
              <Name>{foodName(existing, lang)}</Name>
              <SourceLabel food={existing} showVerifiedText className="text-xs" />
              <Button type="button" variant="ghost" onClick={() => onUseExisting(existing)}>
                {t('nutrition.existsUse')}
              </Button>
            </div>
          )}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-lg">{t(perServing ? 'nutrition.valuesPerServingTitle' : 'nutrition.valuesPer100Title')}</h3>
              <span className="text-xs text-chalkdim">{t('nutrition.fromLabel')}</span>
            </div>
            <div role="radiogroup" aria-label={t('nutrition.valuesBasis')} className="grid grid-cols-2 gap-1 p-1 mt-3 rounded-[14px] bg-surface2">
              {[
                ['per100', t('nutrition.basisPer100')],
                ['serving', t('nutrition.basisPerServing')],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={f.mode === k}
                  onClick={() => setF((s) => ({ ...s, mode: k }))}
                  className={`min-h-[44px] rounded-[11px] text-sm font-medium press transition-colors ${f.mode === k ? 'bg-chalk text-ink' : 'text-chalkdim hover:text-chalk'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <MacroInputs values={f} onChange={(k, v) => setF((s) => ({ ...s, [k]: v }))} />
            </div>
            {ready &&
              (sanity ? (
                <div className="mt-3 rounded-[14px] bg-surface2 p-3 flex gap-2.5 text-sm" role="status">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-chalkdim" aria-hidden="true" />
                  <p>
                    {sanity.kind === 'kcal'
                      ? t(perServing ? 'nutrition.sanityKcalServing' : 'nutrition.sanityKcal', { kcal: fmt(per100('kcal'), 0), est: fmt(sanity.est, 0) })
                      : t(perServing ? 'nutrition.sanityMacrosServing' : 'nutrition.sanityMacros')}
                  </p>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-chalk" role="status">
                  <Check size={16} /> {t('nutrition.sanityOk')}
                </p>
              ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-chalkdim">
              {t('nutrition.servingSize')} {!perServing && <>({t('nutrition.servingOptional')})</>}
            </span>
            <input inputMode="decimal" dir="ltr" className="num w-full !text-lg" value={f.serving} onChange={set('serving')} placeholder={g} required={perServing} />
          </label>
          {/* the not-found banner already says who the product is saved for */}
          {!(scanned && !incomplete) && (
            <p className="flex gap-2.5 items-start text-sm text-chalkdim">
              <SourceLabel food={{ source: isAdmin ? 'coach' : 'user', verified: !!isAdmin }} className="text-xs mt-0.5" />
              <span>{isAdmin ? t('nutrition.unverifiedNoteAdmin') : t('nutrition.unverifiedNote')}</span>
            </p>
          )}
          {error && (
            <p className="text-sm text-irontext" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shrink-0">
          <Button type="submit" variant="brass" className="w-full min-h-[52px] text-base" disabled={busy}>
            <Check size={20} /> {t('nutrition.saveAndAdd')}
          </Button>
        </div>
      </form>
    </>
  )
}
