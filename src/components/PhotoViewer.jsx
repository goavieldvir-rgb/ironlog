import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { photoSrc, photoSrcNow, thumbPath } from '../lib/photos.js'
import ZoomPane, { UNZOOMED, zoomAt } from './ZoomPane.jsx'

export function photoDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

// The local URL of a stored photo once it has loaded (null until then).
// Nothing is fetched while `enabled` is false.
export function usePhotoSrc(path, enabled = true) {
  const [state, setState] = useState(() => ({ path, url: path ? photoSrcNow(path) : null }))
  const url = state.path === path ? state.url : path ? photoSrcNow(path) : null
  useEffect(() => {
    if (!path || !enabled || photoSrcNow(path)) {
      setState({ path, url: path ? photoSrcNow(path) : null })
      return
    }
    let live = true
    photoSrc(path).then(
      (u) => live && setState({ path, url: u }),
      (e) => console.error(e),
    )
    return () => {
      live = false
    }
  }, [path, enabled])
  return url
}

// A grid thumbnail that only downloads once it scrolls near the screen.
export function PhotoThumb({ photo, alt, className = '' }) {
  const ref = useRef(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        setNear(true)
        io.disconnect()
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const url = usePhotoSrc(thumbPath(photo), near)
  return (
    <span ref={ref} className={`block w-full h-full ${className}`}>
      {url && <img src={url} alt={alt} draggable={false} className="w-full h-full object-cover" />}
    </span>
  )
}

// Keeps the browser's Back button (and Android's back gesture) closing the
// full-screen view instead of leaving the page.
export function useBackToClose(onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    window.history.pushState({ ...(window.history.state || {}), photoViewer: true }, '')
    const onPop = () => closeRef.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return useCallback(() => {
    if (window.history.state?.photoViewer) window.history.back()
    else closeRef.current()
  }, [])
}

// Full-screen frame shared by the single-photo viewer and the comparison:
// stops the page behind from scrolling, and puts focus back where it was.
export function useFullScreen(firstFocus) {
  useEffect(() => {
    const prevFocus = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstFocus.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [firstFocus])
}

export function IconButton({ label, onClick, children, pressed, disabled, btnRef }) {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-chalk disabled:opacity-30 ${pressed ? 'bg-chalk/20' : 'hover:bg-chalk/10'}`}
    >
      {children}
    </button>
  )
}

// One photo at a time, full screen: pinch or double-tap to zoom, swipe or
// use the arrows for the next one.
export default function PhotoViewer({ photos, index, onIndex, onClose, onDownload, onDelete }) {
  const { t, lang } = useLanguage()
  const rtl = lang === 'he'
  const [view, setView] = useState(UNZOOMED)
  const closeBtn = useRef(null)
  const stage = useRef(null)
  const close = useBackToClose(onClose)
  useFullScreen(closeBtn)

  const photo = photos[index]
  const full = usePhotoSrc(photo?.path)
  const thumb = usePhotoSrc(photo ? thumbPath(photo) : null)

  useEffect(() => setView(UNZOOMED), [photo?.id])

  // The neighbours load in the background so swiping is instant.
  useEffect(() => {
    for (const p of [photos[index + 1], photos[index - 1]]) if (p) photoSrc(p.path).catch(() => {})
  }, [photos, index])

  const go = useCallback(
    (step) => {
      const next = index + step
      if (next >= 0 && next < photos.length) onIndex(next)
    },
    [index, photos.length, onIndex],
  )

  function zoomBy(k) {
    const r = stage.current?.getBoundingClientRect()
    setView((v) => (r ? zoomAt(v, k, 0, 0, r.width, r.height, true) : v))
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(rtl ? -1 : 1)
      else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1)
      else if (e.key === '+' || e.key === '=') zoomBy(1.5)
      else if (e.key === '-') zoomBy(1 / 1.5)
      else if (e.key === '0') setView(UNZOOMED)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!photo) return null
  const label = `${t(`photos.angle.${photo.angle}`)} · ${photoDate(lang, photo.taken_on)}`

  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-black flex flex-col text-chalk"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <IconButton label={t('common.close')} onClick={close} btnRef={closeBtn}>
          <X size={22} />
        </IconButton>
        <div className="flex-1 min-w-0 px-1">
          <div className="text-sm truncate">{label}</div>
          {photos.length > 1 && <div className="text-xs text-chalkdim num">{t('photos.counter')(index + 1, photos.length)}</div>}
        </div>
        {onDownload && (
          <IconButton label={t('photos.download')} onClick={() => onDownload(photo)}>
            <Download size={20} />
          </IconButton>
        )}
        {onDelete && (
          <IconButton label={t('common.delete')} onClick={() => onDelete(photo)}>
            <Trash2 size={20} />
          </IconButton>
        )}
      </div>

      <div ref={stage} className="flex-1 min-h-0">
        <ZoomPane
          src={full || thumb}
          alt={label}
          view={view}
          onView={setView}
          loading={!full}
          onSwipe={(d) => go((d === 'left') !== rtl ? 1 : -1)}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <IconButton label={t('photos.previous')} onClick={() => go(-1)} disabled={index === 0}>
          <ChevronLeft size={24} className="rtl:-scale-x-100" />
        </IconButton>
        <div className="flex items-center gap-1">
          <IconButton label={t('photos.zoomOut')} onClick={() => zoomBy(1 / 1.5)} disabled={view.s <= 1}>
            <ZoomOut size={20} />
          </IconButton>
          <IconButton label={t('photos.zoomReset')} onClick={() => setView(UNZOOMED)} disabled={view.s <= 1}>
            <RotateCcw size={18} />
          </IconButton>
          <IconButton label={t('photos.zoomIn')} onClick={() => zoomBy(1.5)}>
            <ZoomIn size={20} />
          </IconButton>
        </div>
        <IconButton label={t('photos.next')} onClick={() => go(1)} disabled={index >= photos.length - 1}>
          <ChevronRight size={24} className="rtl:-scale-x-100" />
        </IconButton>
      </div>
      <p className="sr-only">{t('photos.zoomHint')}</p>
    </div>,
    document.body,
  )
}
