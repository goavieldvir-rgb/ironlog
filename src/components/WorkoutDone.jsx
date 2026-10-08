import React, { useEffect, useRef, useState } from 'react'
import { Share2, Trophy, Check, ImagePlus, Copy, Download } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Button, Card } from './ui.jsx'
import { prepareCard, shareFile, loadPhoto, downloadFile, copyImage, canCopyImage, isIOS } from '../lib/shareCard.js'

const iso = (s) => `⁦${s}⁩`

function formatDate(date, lang) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
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
    brand: 'IRONLOG',
    duration: t('share.duration'),
    volume: t('share.volume'),
    distance: t('share.distance'),
    sets: t('share.sets'),
    streak: t('share.streak'),
    weekUnit: t('share.weekUnit'),
    min: t('share.min'),
  }
  const fileName = (v) => `ironlog-${summary.date || 'workout'}${v === 'sticker' ? '-sticker' : ''}.png`

  function remember(key, file) {
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    setMade((m) => ({ ...m, [key]: { file, url } }))
  }

  // Plain card and sticker are drawn as soon as the screen opens.
  useEffect(() => {
    let cancelled = false
    setMade({})
    setFailed(false)
    ;['plain', 'sticker'].forEach((v) => {
      prepareCard(summary, { rtl: dir === 'rtl', labels, variant: v }, fileName(v))
        .then((f) => !cancelled && remember(v, f))
        .catch((err) => {
          console.error(err)
          if (!cancelled && v === 'plain') setFailed(true)
        })
    })
    return () => {
      cancelled = true
    }
  }, [summary, dir, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  async function handlePhoto(e) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setPhotoBusy(true)
    let photo = null
    try {
      photo = await loadPhoto(picked)
      const f = await prepareCard(summary, { rtl: dir === 'rtl', labels, variant: 'photo', photo }, fileName('photo'))
      remember('photo', f)
      setVariant('photo')
    } catch (err) {
      console.error(err)
      toast(t('share.photoFailed'), 'error')
    } finally {
      photo?.close?.()
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

  const stats = [
    summary.durationMinutes && [t('share.duration'), `${summary.durationMinutes} ${t('share.min')}`],
    summary.volume > 0 && [t('share.volume'), `${summary.volume.toLocaleString('en-US')} ${summary.volumeUnit}`],
    summary.cardioMinutes > 0 && [t('share.cardio'), `${summary.cardioMinutes} ${t('share.min')}`],
    summary.cardioDistance != null && [t('share.distance'), `${Math.round(summary.cardioDistance * 100) / 100} ${summary.cardioUnit}`],
    [t('share.sets'), String(summary.setCount)],
  ].filter(Boolean)

  const tabs = [
    ['plain', t('share.tabPlain')],
    ['photo', t('share.tabPhoto')],
    ['sticker', t('share.tabSticker')],
  ]

  return (
    <div className="flex flex-col gap-5 max-w-2xl" data-testid="workout-done">
      <div>
        <div className="inline-flex items-center gap-2 text-good">
          <Check size={18} /> <span className="eyebrow">{t('share.subtitle')}</span>
        </div>
        <h1 className="text-3xl mt-1">{t('share.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">
          {summary.routineName} · {dateText}
        </p>
      </div>

      <div className="flex gap-3">
        {stats.slice(0, 3).map(([label, value]) => (
          <Card key={label} className="text-center !p-3 flex-1 min-w-0">
            <div className="num text-base font-semibold whitespace-nowrap">{iso(value)}</div>
            <div className="text-chalkdim text-xs mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {summary.prCount > 0 && (
        <p className="inline-flex items-center gap-2 text-brass text-sm">
          <Trophy size={16} /> {t('share.records')}: <span className="num">{iso(String(summary.prCount))}</span>
        </p>
      )}

      {!failed && (
        <div className="flex flex-col gap-3" data-testid="share-section">
          <div role="tablist" className="grid grid-cols-3 gap-1 bg-surface2 rounded-lg p-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={variant === key}
                onClick={() => setVariant(key)}
                className={`min-h-[44px] rounded-md text-sm font-medium ${variant === key ? 'bg-brass text-ink' : 'text-chalkdim'}`}
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
                className={`rounded-lg border border-line max-h-[420px] w-auto ${variant === 'sticker' ? 'bg-[#6b7280]' : ''}`}
              />
            ) : variant === 'photo' ? (
              <p className="text-chalkdim text-sm text-center py-6">{t('share.photoHint')}</p>
            ) : (
              <p className="text-chalkdim text-sm text-center py-6">{t('share.sharing')}</p>
            )}
          </div>

          {variant === 'photo' && (
            <>
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handlePhoto} data-testid="photo-input" />
              <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
                <ImagePlus size={16} /> {photoBusy ? t('share.sharing') : current ? t('share.changePhoto') : t('share.choosePhoto')}
              </Button>
            </>
          )}

          {variant === 'sticker' && (
            <>
              <p className="text-chalkdim text-xs">{t('share.stickerHelp')}</p>
              <div className="flex gap-3">
                {canCopyImage() && (
                  <Button variant="brass" className="flex-1" onClick={handleCopy} disabled={!current}>
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
        {!failed && variant !== 'sticker' && (
          <Button variant="brass" className="flex-1" onClick={handleShare} disabled={busy || !current}>
            <Share2 size={16} /> {busy || (!current && variant !== 'photo') ? t('share.sharing') : t('share.share')}
          </Button>
        )}
        <Button variant="ghost" className="flex-1" onClick={onDone}>
          {t('share.done')}
        </Button>
      </div>

      <Card className="flex flex-col gap-2">
        {summary.rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {r.name}
              {r.pr && <span className="ms-2 text-xs bg-brass text-ink rounded-full px-2 py-0.5 font-semibold">{t('share.prTag')}</span>}
            </span>
            <span className="num text-chalkdim shrink-0">{iso(r.text)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
