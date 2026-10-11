import React, { useState } from 'react'
import { AlertCircle, AlertTriangle, Check } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { Button } from '../ui.jsx'
import { createLabelFood, findFoodsByBarcode, foodName, friendlyError, parseNum, sanityCheck, fmt } from '../../lib/nutrition.js'
import { Name, SheetHeader, SourceLabel } from './parts.jsx'

// Add a product from its label ("new product"). Values are per 100 g.
export default function LabelForm({ barcode: initialBarcode = '', uid, isAdmin, onBack, onClose, onSaved, onUseExisting }) {
  const { t, lang } = useLanguage()
  const scanned = !!initialBarcode
  const [f, setF] = useState({ name: '', barcode: initialBarcode, kcal: '', protein: '', carbs: '', fat: '', serving: '' })
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const num = (k) => parseNum(f[k])
  const filled = ['kcal', 'protein', 'carbs', 'fat'].every((k) => f[k] !== '' && Number.isFinite(num(k)))
  const sanity = filled ? sanityCheck({ kcal: num('kcal'), protein: num('protein'), carbs: num('carbs'), fat: num('fat') }) : null

  async function save(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    const name = f.name.trim()
    const code = f.barcode.replace(/\s+/g, '')
    if (!name) return setError(t('nutrition.needName'))
    if (!filled) return setError(t('nutrition.needValues'))
    if (code && !/^\d{8,14}$/.test(code)) return setError(t('nutrition.badBarcode'))
    const vals = { kcal: num('kcal'), protein: num('protein'), carbs: num('carbs'), fat: num('fat') }
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
      const serving = parseNum(f.serving)
      const food = await createLabelFood({ uid, isAdmin, lang, name, barcode: code, ...vals, serving: Number.isFinite(serving) && serving > 0 ? serving : 0 })
      await onSaved(food)
    } catch (err) {
      console.error(err)
      setError(friendlyError(err, t))
    } finally {
      setBusy(false)
    }
  }

  const g = t('nutrition.g')
  const field = (k, label, unit) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-chalkdim">{label} ({unit})</span>
      <input inputMode="decimal" dir="ltr" className="num w-full text-center !text-lg" value={f[k]} onChange={set(k)} placeholder="0" />
    </label>
  )

  return (
    <>
      <SheetHeader title={t('nutrition.newProduct')} onBack={onBack} onClose={onClose} />
      <form onSubmit={save} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
          {scanned && (
            <div className="rounded-lg border border-line bg-ink p-3 flex gap-2.5 text-sm text-chalkdim">
              <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-chalk font-medium">{t('nutrition.barcodeNotFoundTitle')}</p>
                <p>{t('nutrition.barcodeNotFoundBody')}</p>
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">{t('nutrition.productName')}</span>
            <input dir="auto" value={f.name} onChange={set('name')} autoFocus={!scanned} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">
              {t('nutrition.barcode')} {!scanned && <span className="normal-case tracking-normal">({t('nutrition.barcodeOptional')})</span>}
            </span>
            <input inputMode="numeric" dir="ltr" className="num" value={f.barcode} onChange={(e) => setF((s) => ({ ...s, barcode: e.target.value.replace(/[^\d]/g, '') }))} readOnly={scanned} />
          </label>
          {existing && (
            <div className="rounded-lg border border-line bg-ink p-3 flex flex-col gap-2" role="alert">
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
              <h3 className="text-lg">{t('nutrition.valuesPer100Title')}</h3>
              <span className="text-xs text-chalkdim">{t('nutrition.fromLabel')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              {field('protein', t('nutrition.protein'), g)}
              {field('kcal', t('nutrition.calories'), t('nutrition.kcalUnit'))}
              {field('carbs', t('nutrition.carbs'), g)}
              {field('fat', t('nutrition.fat'), g)}
            </div>
            {filled &&
              (sanity ? (
                <div className="mt-3 rounded-lg border border-chalkdim/40 bg-ink p-3 flex gap-2.5 text-sm" role="status">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-chalkdim" aria-hidden="true" />
                  <p>
                    {sanity.kind === 'kcal'
                      ? t('nutrition.sanityKcal', { kcal: fmt(num('kcal'), 0), est: fmt(sanity.est, 0) })
                      : t('nutrition.sanityMacros')}
                  </p>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-good" role="status">
                  <Check size={16} /> {t('nutrition.sanityOk')}
                </p>
              ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">
              {t('nutrition.servingSize')} <span className="normal-case tracking-normal">({t('nutrition.servingOptional')})</span>
            </span>
            <input inputMode="decimal" dir="ltr" className="num w-full text-center" value={f.serving} onChange={set('serving')} placeholder={g} />
          </label>
          <p className="flex gap-2.5 items-start text-sm text-chalkdim">
            <SourceLabel food={{ source: isAdmin ? 'coach' : 'user', verified: !!isAdmin }} className="text-xs mt-0.5" />
            <span>{isAdmin ? t('nutrition.unverifiedNoteAdmin') : t('nutrition.unverifiedNote')}</span>
          </p>
          {error && (
            <p className="text-sm text-irontext" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="p-4 border-t border-line shrink-0">
          <Button type="submit" variant="brass" className="w-full min-h-[52px] text-base" disabled={busy}>
            <Check size={20} /> {t('nutrition.saveAndAdd')}
          </Button>
        </div>
      </form>
    </>
  )
}
