import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import {
  ANGLES,
  fetchPhotoStatus,
  listPhotos,
  addPhoto,
  deletePhoto,
  downloadPhoto,
  turnPhotosOn,
  turnPhotosOff,
} from '../lib/photos.js'
import { photosConsent } from '../legal/photos.js'
import { Button, Field } from './ui.jsx'
import PhotoCompare from './PhotoCompare.jsx'
import PhotoViewer, { PhotoThumb } from './PhotoViewer.jsx'

const PREVIEW_COUNT = 9

const newestFirst = (a, b) =>
  a.taken_on !== b.taken_on ? (a.taken_on < b.taken_on ? 1 : -1) : a.created_at < b.created_at ? 1 : -1

function shortDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

// Progress photos for one person.
//  - mode 'own': the trainee's own photos, with the opt-in, adding, deleting
//    and switching off.
//  - mode 'coach': the coach's view (trainee page, or managing the account):
//    compare and delete only. The coach can never add photos or switch them
//    on for someone; the database refuses that too.
export default function ProgressPhotos({ uid, mode = 'own' }) {
  const own = mode === 'own'
  const { t, lang } = useLanguage()
  const { confirm, toast } = useFeedback()
  const [status, setStatus] = useState(null)
  const [photos, setPhotos] = useState([])
  // Photos still being prepared and sent: { key, taken_on, angle, preview }.
  const [pending, setPending] = useState([])
  const [viewing, setViewing] = useState(null)
  const [failed, setFailed] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [busy, setBusy] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [form, setForm] = useState({ date: toLocalISODate(), angle: 'front' })
  const fileRef = useRef(null)
  // Only the newest load may write state, so a slow answer for the previous
  // trainee can never show up on the next one's page.
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    try {
      const st = await fetchPhotoStatus(uid)
      const list = st.minor ? [] : await listPhotos(uid)
      if (id !== loadId.current) return
      setStatus(st)
      setPhotos(list)
      setFailed(false)
    } catch (e) {
      console.error(e)
      if (id === loadId.current) setFailed(true)
    }
  }, [uid])

  useEffect(() => {
    setStatus(null)
    setPhotos([])
    setViewing(null)
    setFailed(false)
    setShowConsent(false)
    setShowAll(false)
    load()
    return () => {
      loadId.current++
    }
  }, [load])

  async function enable() {
    setBusy('consent')
    try {
      await turnPhotosOn(uid, lang)
      setShowConsent(false)
      await load()
    } catch (e) {
      console.error(e)
      toast(t('feedback.saveFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function disable() {
    const ok = await confirm({
      title: t('photos.turnOffTitle'),
      body: t('photos.turnOffBody'),
      confirmLabel: t('photos.turnOffConfirm'),
      danger: true,
    })
    if (!ok) return
    setBusy('off')
    try {
      await turnPhotosOff(uid, lang)
      await load()
      toast(t('photos.turnedOff'))
    } catch (e) {
      console.error(e)
      toast(t('feedback.deleteFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  // The photo shows in the grid straight away and is sent in the
  // background, so the page never waits; several can be added in a row.
  async function onPick(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    const { date, angle } = form
    for (const file of files) {
      const key = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      setPending((list) => [{ key, taken_on: date, angle, preview }, ...list])
      try {
        const row = await addPhoto(uid, file, date, angle)
        setPhotos((list) => [row, ...list].sort(newestFirst))
        toast(t('photos.added'))
      } catch (err) {
        console.error(err)
        toast(t(err?.message === 'IMAGE_DECODE_FAILED' ? 'photos.unsupported' : 'photos.addFailed'), 'error')
      } finally {
        setPending((list) => list.filter((x) => x.key !== key))
        URL.revokeObjectURL(preview)
      }
    }
  }

  async function save(p) {
    try {
      await downloadPhoto(p)
    } catch (e) {
      console.error(e)
      toast(t('photos.downloadFailed'), 'error')
    }
  }

  async function remove(p) {
    if (!(await confirm({ title: t('photos.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
    try {
      await deletePhoto(p)
      setPhotos((list) => {
        const next = list.filter((x) => x.id !== p.id)
        setViewing((v) => (v == null ? v : next.length ? Math.min(v, next.length - 1) : null))
        return next
      })
      toast(t('feedback.deleted'))
    } catch (e) {
      console.error(e)
      toast(t('feedback.deleteFailed'), 'error')
    }
  }

  if (failed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-chalkdim">{t('common.loadFailedTitle')}</p>
        <Button variant="ghost" onClick={load}>{t('common.tryAgain')}</Button>
      </div>
    )
  }
  if (!status) return <div className="h-16" />

  if (status.minor) {
    return <p className="text-sm text-chalkdim">{t(own ? 'photos.ownMinor' : 'photos.coachMinor')}</p>
  }

  if (!status.enabled && photos.length === 0) {
    if (!own) return <p className="text-sm text-chalkdim">{t('photos.coachOff')}</p>
    const doc = photosConsent[lang] || photosConsent.en
    return showConsent ? (
      <div className="flex flex-col gap-3">
        <p className="text-sm">{doc.intro}</p>
        <ul className="flex flex-col gap-2">
          {doc.points.map((pt) => (
            <li key={pt} className="text-sm text-chalkdim leading-relaxed flex gap-2">
              <span className="text-accent shrink-0">·</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
        <Link to="/privacy" className="text-xs text-chalkdim underline self-start">{t('photos.privacyLink')}</Link>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={enable} disabled={busy === 'consent'}>{doc.accept}</Button>
          <Button variant="ghost" onClick={() => setShowConsent(false)}>{t('common.cancel')}</Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-3 items-start">
        <p className="text-sm text-chalkdim">{t('photos.offIntro')}</p>
        <Button variant="ghost" onClick={() => setShowConsent(true)}>
          <Lock size={15} /> {t('photos.learnMore')}
        </Button>
      </div>
    )
  }

  const shown = showAll ? photos : photos.slice(0, PREVIEW_COUNT)

  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 ? (
        <PhotoCompare photos={photos} />
      ) : (
        <p className="text-sm text-chalkdim">{own ? t('photos.emptyOwn') : t('photos.coachEmpty')}</p>
      )}

      {own && status.enabled && (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label={t('photos.date')}>
            <input type="date" value={form.date} max={toLocalISODate()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <div role="radiogroup" aria-label={t('photos.angleLabel')} className="flex flex-col gap-1">
            <span className="text-xs text-chalkdim">{t('photos.angleLabel')}</span>
            <div className="flex gap-1 bg-surface2 rounded-[12px] p-1">
              {ANGLES.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={form.angle === a}
                  onClick={() => setForm({ ...form, angle: a })}
                  className={`px-3 min-h-9 rounded-[9px] text-sm ${form.angle === a ? 'bg-surface text-chalk' : 'text-chalkdim'}`}
                >
                  {t(`photos.angle.${a}`)}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={!form.date}>
            <Camera size={16} /> {t('photos.add')}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        </div>
      )}

      {(photos.length > 0 || pending.length > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="eyebrow">{t('photos.all')}</h3>
          <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {pending.map((p) => (
              <li key={p.key} className="relative aspect-[3/4] rounded-[10px] bg-surface2 overflow-hidden" aria-busy="true">
                <img src={p.preview} alt="" className="w-full h-full object-cover opacity-60" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-6 h-6 rounded-full border-2 border-chalk/30 border-t-chalk animate-spin" />
                </span>
                <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-ink/70 text-[11px] leading-tight text-chalk">{t('photos.uploading')}</div>
              </li>
            ))}
            {shown.map((p, i) => {
              const label = `${t(`photos.angle.${p.angle}`)}, ${shortDate(lang, p.taken_on)}`
              return (
                <li key={p.id} className="relative aspect-[3/4] rounded-[10px] bg-surface2 overflow-hidden">
                  <button type="button" onClick={() => setViewing(i)} aria-label={`${label}. ${t('photos.tapToEnlarge')}`} className="block w-full h-full">
                    <PhotoThumb photo={p} alt="" />
                    <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-ink/70 text-[11px] leading-tight text-start">
                      <div className="text-chalk">{t(`photos.angle.${p.angle}`)}</div>
                      <div className="text-chalkdim num">{shortDate(lang, p.taken_on)}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {photos.length > PREVIEW_COUNT && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs text-chalkdim self-start min-h-9">
              {showAll ? t('photos.showLess') : t('photos.showAll')(photos.length)}
            </button>
          )}
        </div>
      )}

      {viewing != null && photos[viewing] && (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onDownload={own ? save : undefined}
          onDelete={remove}
        />
      )}

      {own && (status.enabled || photos.length > 0) && (
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-3">
          <p className="text-xs text-chalkdim flex items-center gap-1.5">
            <Lock size={12} /> {t('photos.privateNote')}
          </p>
          <button onClick={disable} disabled={busy === 'off'} className="text-xs text-irontext min-h-9">
            {t('photos.turnOff')}
          </button>
        </div>
      )}
    </div>
  )
}
