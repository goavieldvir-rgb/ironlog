import React, { useEffect, useState } from 'react'
import { Share2, Trophy, Check } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Button, Card } from './ui.jsx'
import { prepareCard, shareFile } from '../lib/shareCard.js'

const iso = (s) => `⁦${s}⁩`

function formatDate(date, lang) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

// Shown right after a workout is saved: a short recap with a Share button
// (picture card through the phone's share menu) and a Done button.
export default function WorkoutDone({ summary, onDone }) {
  const { t, lang, dir } = useLanguage()
  const { toast } = useFeedback()
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  const [failed, setFailed] = useState(false)
  const dateText = formatDate(summary.date, lang)

  // Draw the picture as soon as the screen opens so the Share tap can open
  // the share menu immediately (phones refuse it if we make them wait).
  useEffect(() => {
    let cancelled = false
    prepareCard(
      summary,
      {
        rtl: dir === 'rtl',
        dateText,
        labels: {
          brand: 'IRONLOG',
          duration: t('share.duration'),
          volume: t('share.volume'),
          records: t('share.records'),
          sets: t('share.sets'),
          cardio: t('share.cardio'),
          distance: t('share.distance'),
          prTag: t('share.prTag'),
          more: t('share.more'),
          min: t('share.min'),
        },
      },
      `ironlog-${summary.date || 'workout'}.png`,
    )
      .then((f) => !cancelled && setFile(f))
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [summary, dir, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleShare() {
    if (!file) return
    setBusy(true)
    try {
      const result = await shareFile(file, {
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

  const stats = [
    summary.durationMinutes && [t('share.duration'), `${summary.durationMinutes} ${t('share.min')}`],
    summary.volume > 0 && [t('share.volume'), `${summary.volume.toLocaleString('en-US')} ${summary.volumeUnit}`],
    summary.cardioMinutes > 0 && [t('share.cardio'), `${summary.cardioMinutes} ${t('share.min')}`],
    summary.cardioDistance != null && [t('share.distance'), `${Math.round(summary.cardioDistance * 100) / 100} ${summary.cardioUnit}`],
    [t('share.sets'), String(summary.setCount)],
  ].filter(Boolean)

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

      <div className="flex gap-3">
        <Button variant="brass" className="flex-1" onClick={handleShare} disabled={busy || !file || failed}>
          <Share2 size={16} /> {busy || (!file && !failed) ? t('share.sharing') : t('share.share')}
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onDone}>
          {t('share.done')}
        </Button>
      </div>
    </div>
  )
}
