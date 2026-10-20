import React, { useEffect, useRef, useState } from 'react'
import { Share2, Trophy, Check, ImagePlus, Copy, Download } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Button } from './ui.jsx'
import { dateLocale } from '../lib/dates.js'
import { prepareCard, shareFile, loadPhoto, downloadFile, copyImage, canCopyImage, isIOS, shareFontsReady, shareFontsLoaded } from '../lib/shareCard.js'

const iso = (s) => `⁦${s}⁩`

function formatDate(date, lang) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' })
}

// Shown right after a workout is saved: a recap only the trainee sees, and
// a way to share a trimmed-down picture (name, big total, time, streak) as
// a plain card, over their own photo, or as a see-through sticker.
export default function WorkoutDone({ summary, onDone }) {
  const { t, lang, dir } = useLanguage()
  const { toast } = useFeedback()
  const [variant, setVariant] = useState('plain')
  // Each picture is made ahead of any tap, so the share menu / clipboard can
  // open straight from the tap (phones refuse it if we make them wait).
  const [made, setMade] = useState({}) // { plain: { file, url }, photo, sticker }
  const [failed, setFailed] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef(null)
  const dateText = formatDate(summary.date, lang)
  const urls = useRef([])

  const labels = {
    eyebrow: t('share.cardEyebrow'),
    totalVolume: t('share.totalVolume'),
    duration: t('share.duration'),
    volume: t('share.volume'),
    distance: t('share.distance'),
    sets: t('share.sets'),
    streak: t('share.streak'),
    weekUnit: t('share.weekUnit'),
    min: t('share.min'),
  }
  // the photo version is a JPEG, the others PNG (the sticker needs see-through)
  const fileName = (v) => `ironlog-${summary.date || 'workout'}${v === 'sticker' ? '-sticker' : ''}.${v === 'photo' ? 'jpg' : 'png'}`
  const photoRef = useRef(null) // the picked photo, kept so the card can be redrawn

  function remember(key, file) {
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    setMade((m) => ({ ...m, [key]: { file, url } }))
  }

  // Plain card and sticker are drawn as soon as the screen opens (and the
  // photo one again, if a photo is already picked and the language changed).
  useEffect(() => {
    let cancelled = false
    setMade({})
    setFailed(false)
    const draw = (v) =>
      prepareCard(summary, { rtl: dir === 'rtl', labels, variant: v, photo: v === 'photo' ? photoRef.current : null }, fileName(v))
        .then((f) => !cancelled && remember(v, f))
        .catch((err) => {
          console.error(err)
          if (!cancelled && v === 'plain') setFailed(true)
        })
    const variants = ['plain', 'sticker', ...(photoRef.current ? ['photo'] : [])]
    Promise.all(variants.map(draw)).then(() => {
      // Slow connection: the cards were drawn with fallback fonts. Draw them
      // again in the real ones as soon as those arrive.
      if (cancelled || shareFontsLoaded()) return
      shareFontsReady().then((ok) => {
        if (ok && !cancelled) variants.forEach(draw)
      })
    })
    return () => {
      cancelled = true
    }
  }, [summary, dir, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      photoRef.current?.close?.()
    },
    [],
  )

  async function handlePhoto(e) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setPhotoBusy(true)
    let photo = null
    try {
      photo = await loadPhoto(picked)
      const f = await prepareCard(summary, { rtl: dir === 'rtl', labels, variant: 'photo', photo }, fileName('photo'))
      photoRef.current?.close?.()
      photoRef.current = photo
      remember('photo', f)
      setVariant('photo')
      if (!shareFontsLoaded()) {
        // fonts still arriving: redraw this one when they do
        shareFontsReady().then((ok) => {
          if (ok && photoRef.current === photo) {
            prepareCard(summary, { rtl: dir === 'rtl', labels, variant: 'photo', photo }, fileName('photo')).then((g) => remember('photo', g)).catch(() => {})
          }
        })
      }
    } catch (err) {
      console.error(err)
      if (photo && photoRef.current !== photo) photo.close?.()
      toast(t('share.photoFailed'), 'error')
    } finally {
      setPhotoBusy(false)
    }
  }

  const current = made[variant]

  async function handleShare() {
    if (!current) return
    setBusy(true)
    try {
      const result = await shareFile(current.file, {
        text: t('share.cardCaption', { name: summary.routineName, date: dateText }),
        title: t('share.cardTitle'),
      })
      if (result === 'downloaded') toast(t('share.downloaded'))
    } catch (err) {
      console.error(err)
      toast(t('share.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!current) return
    try {
      await copyImage(current.file)
      toast(t('share.copied'))
    } catch (err) {
      console.error(err)
      toast(t('share.copyFailed'), 'error')
    }
  }

  async function handleSave() {
    if (!current) return
    try {
      let result = 'downloaded'
      if (isIOS()) result = await shareFile(current.file, {}) // share sheet -> Save Image -> Photos
      else downloadFile(current.file)
      if (result === 'downloaded') toast(t('share.saved'))
    } catch (err) {
      console.error(err)
      toast(t('share.failed'), 'error')
    }
  }

  // One number leads (volume, else cardio distance, else time); the rest sit
  // quietly underneath. Records take the accent, as they do mid-workout.
  const dist = summary.cardioDistance != null ? Math.round(summary.cardioDistance * 100) / 100 : null
  const all = {
    volume: summary.volume > 0 && { label: t('share.volume'), value: summary.volume.toLocaleString('en-US'), unit: summary.volumeUnit },
    distance: dist > 0 && { label: t('share.distance'), value: String(dist), unit: summary.cardioUnit },
    duration: summary.durationMinutes && { label: t('share.duration'), value: String(summary.durationMinutes), unit: t('share.min') },
    cardio: summary.cardioMinutes > 0 && { label: t('share.cardio'), value: String(summary.cardioMinutes), unit: t('share.min') },
    sets: { label: t('share.sets'), value: String(summary.setCount) },
    records: summary.prCount > 0 && { label: t('share.records'), value: String(summary.prCount), accent: true },
  }
  const heroKey = ['volume', 'distance', 'duration', 'cardio'].find((k) => all[k])
  const hero = heroKey && all[heroKey]
  const rest = ['duration', 'cardio', 'sets', 'records']
    .filter((k) => k !== heroKey && all[k])
    .map((k) => all[k])
    .slice(0, 3)

  const tabs = [
    ['plain', t('share.tabPlain')],
    ['photo', t('share.tabPhoto')],
    ['sticker', t('share.tabSticker')],
  ]

  return (
    <div className="flex flex-col gap-6 max-w-2xl" data-testid="workout-done">
      <div>
        <p className="eyebrow inline-flex items-center gap-1.5">
          <Check size={15} strokeWidth={2.5} className="text-good" /> {t('share.subtitle')}
        </p>
        <h1 className="text-[28px] leading-tight mt-1.5">{t('share.title')}</h1>
        <p className="text-chalkdim text-[15px] mt-1">
          <bdi>{summary.routineName}</bdi> · <bdi>{dateText}</bdi>
        </p>
      </div>

      <div className="card p-5" data-testid="recap-stats">
        {hero && (
          <div>
            <p className="eyebrow">{hero.label}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="stat-number">{iso(hero.value)}</span>
              {hero.unit && <span className="text-chalkdim text-lg font-medium">{hero.unit}</span>}
            </p>
          </div>
        )}
        {rest.length > 0 && (
          <div className={`grid grid-cols-3 gap-3 ${hero ? 'mt-5 pt-4 border-t border-white/[0.06]' : ''}`}>
            {rest.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="eyebrow truncate">{s.label}</p>
                <p className={`num text-xl font-semibold mt-0.5 whitespace-nowrap ${s.accent ? 'text-accent' : ''}`}>
                  {iso(s.value)}
                  {s.unit && <span className="text-chalkdim text-sm font-medium ms-1">{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {failed && (
        <p className="text-chalkdim text-sm" role="alert" data-testid="card-failed">
          {t('share.cardFailed')}
        </p>
      )}

      {!failed && (
        <div className="flex flex-col gap-4" data-testid="share-section">
          <div role="tablist" className="grid grid-cols-3 gap-0.5 p-[3px] rounded-[12px] bg-surface">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={variant === key}
                onClick={() => {
                  setVariant(key)
                  // first visit to the photo tab: go straight to the picker
                  if (key === 'photo' && !made.photo && !photoBusy) fileInput.current?.click()
                }}
                className={`min-h-[44px] rounded-[9px] text-sm font-medium transition-colors duration-200 ${
                  variant === key ? 'bg-[#2A2A2E] text-chalk' : 'bg-transparent text-chalkdim'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            {current ? (
              <img
                src={current.url}
                alt=""
                data-testid={`preview-${variant}`}
                className={`rounded-[20px] shadow-2xl shadow-black/60 ring-1 ring-white/[0.06] max-h-[420px] w-auto ${variant === 'sticker' ? 'bg-surface2 p-3' : ''}`}
              />
            ) : variant === 'photo' ? (
              <p className="text-chalkdim text-sm text-center py-6">{t('share.photoHint')}</p>
            ) : (
              <p className="text-chalkdim text-sm text-center py-6">{t('share.sharing')}</p>
            )}
          </div>

          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhoto} data-testid="photo-input" />
          {variant === 'photo' && made.photo && (
            <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
              <ImagePlus size={16} /> {photoBusy ? t('share.sharing') : t('share.changePhoto')}
            </Button>
          )}

          {variant === 'sticker' && (
            <>
              <p className="text-chalkdim text-[13px] leading-relaxed">{t('share.stickerHelp')}</p>
              <div className="flex gap-3">
                {canCopyImage() && (
                  <Button variant="primary" className="flex-1" onClick={handleCopy} disabled={!current}>
                    <Copy size={16} /> {t('share.copySticker')}
                  </Button>
                )}
                <Button variant="ghost" className="flex-1" onClick={handleSave} disabled={!current}>
                  <Download size={16} /> {t('share.save')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {!failed && variant === 'photo' && !made.photo && (
          <Button variant="primary" className="flex-1" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
            <ImagePlus size={16} /> {photoBusy ? t('share.sharing') : t('share.choosePhoto')}
          </Button>
        )}
        {!failed && variant !== 'sticker' && !(variant === 'photo' && !made.photo) && (
          <Button variant="primary" className="flex-1" onClick={handleShare} disabled={busy || !current}>
            <Share2 size={16} /> {busy || !current ? t('share.sharing') : t('share.share')}
          </Button>
        )}
        <Button variant="ghost" className="flex-1" onClick={onDone}>
          {t('share.done')}
        </Button>
      </div>

      {summary.rows.length > 0 && (
        <div className="card overflow-hidden">
          {summary.rows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between gap-3 min-h-[48px] px-4 text-[15px] ${i ? 'border-t border-white/[0.06]' : ''}`}>
              <span className="min-w-0 flex items-center gap-2">
                <span className="truncate">{r.name}</span>
                {r.prKind && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accentsoft text-accent px-2 h-[22px] text-xs font-semibold">
                    <Trophy size={12} />
                    {r.prKind === 'reps' ? t('sessionCard.repsPrBadge') : r.single ? t('sessionCard.prBadge') : t('sessionCard.weightPrBadge')}
                  </span>
                )}
              </span>
              <span className="num text-chalkdim shrink-0">{iso(r.text)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
