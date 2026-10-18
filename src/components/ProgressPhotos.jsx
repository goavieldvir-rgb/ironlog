import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Lock, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { toLocalISODate, fmtDate } from '../lib/dates.js'
import {
  ANGLES,
  fetchPhotoStatus,
  listPhotos,
  photoUrls,
  addPhoto,
  deletePhoto,
  turnPhotosOn,
  turnPhotosOff,
} from '../lib/photos.js'
import { photosConsent } from '../legal/photos.js'
import { Button, Field } from './ui.jsx'
import PhotoCompare from './PhotoCompare.jsx'

const PREVIEW_COUNT = 9

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
  const [urls, setUrls] = useState({})
  const [failed, setFailed] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [busy, setBusy] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [form, setForm] = useState({ date: toLocalISODate(), angle: 'front' })
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const st = await fetchPhotoStatus(uid)
      const list = st.minor ? [] : await listPhotos(uid)
      setStatus(st)
      setPhotos(list)
      setUrls(await photoUrls(list.map((p) => p.path)))
      setFailed(false)
    } catch (e) {
      console.error(e)
      setFailed(true)
    }
  }, [uid])

  useEffect(() => {
    load()
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

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('upload')
    try {
      await addPhoto(uid, file, form.date, form.angle)
      await load()
      toast(t('photos.added'))
    } catch (err) {
      console.error(err)
      toast(t('photos.addFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove(p) {
    if (!(await confirm({ title: t('photos.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return
    try {
      await deletePhoto(p)
      setPhotos((list) => list.filter((x) => x.id !== p.id))
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
        <PhotoCompare photos={photos} urls={urls} />
      ) : (
        <p className="text-sm text-chalkdim">{own ? t('photos.emptyOwn') : t('photos.coachEmpty')}</p>
      )}

      {own && status.enabled && (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label={t('photos.date')}>
            <input type="date" value={form.date} max={toLocalISODate()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t('photos.angleLabel')}>
            <select value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })}>
              {ANGLES.map((a) => (
                <option key={a} value={a}>{t(`photos.angle.${a}`)}</option>
              ))}
            </select>
          </Field>
          <Button onClick={() => fileRef.current?.click()} disabled={busy === 'upload' || !form.date}>
            <Camera size={16} /> {busy === 'upload' ? t('photos.uploading') : t('photos.add')}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="eyebrow">{t('photos.all')}</h3>
          <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {shown.map((p) => (
              <li key={p.id} className="relative aspect-[3/4] rounded-[10px] bg-surface2 overflow-hidden">
                {urls[p.path] && <img src={urls[p.path]} alt="" loading="lazy" className="w-full h-full object-cover" />}
                <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-ink/70 text-[11px] leading-tight">
                  <div className="text-chalk">{t(`photos.angle.${p.angle}`)}</div>
                  <div className="text-chalkdim num">{shortDate(lang, p.taken_on)}</div>
                </div>
                <button
                  onClick={() => remove(p)}
                  aria-label={t('common.delete')}
                  className="absolute top-0 end-0 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-chalk"
                >
                  <span className="rounded-full bg-ink/70 p-1.5"><Trash2 size={13} /></span>
                </button>
              </li>
            ))}
          </ul>
          {photos.length > PREVIEW_COUNT && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs text-chalkdim self-start min-h-9">
              {showAll ? t('photos.showLess') : t('photos.showAll')(photos.length)}
            </button>
          )}
        </div>
      )}

      {own && status.enabled && (
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
