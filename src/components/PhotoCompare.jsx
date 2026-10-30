import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Columns2, Link, Maximize2, RotateCcw, Rows2, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ANGLES, thumbPath } from '../lib/photos.js'
import ZoomPane, { UNZOOMED, zoomAt } from './ZoomPane.jsx'
import { IconButton, photoDate as fullDate, useBackToClose, useFullScreen, usePhotoSrc } from './PhotoViewer.jsx'

// A compare photo: the thumbnail first, then the full image.
function useBestSrc(photo) {
  const full = usePhotoSrc(photo?.path)
  const thumb = usePhotoSrc(photo ? thumbPath(photo) : null)
  return { src: full || thumb, loading: !!photo && !full }
}

function ComparePhoto({ photo, alt, onOpen }) {
  const { src, loading } = useBestSrc(photo)
  return (
    <button type="button" onClick={onOpen} aria-label={alt} className="relative w-full h-full block">
      {src && <img src={src} alt="" draggable={false} className="w-full h-full object-contain" />}
      {loading && !src && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-6 h-6 rounded-full border-2 border-chalk/30 border-t-chalk animate-spin" />
        </span>
      )}
    </button>
  )
}

function ComparePane({ photo, label, view, onView, select }) {
  const { src, loading } = useBestSrc(photo)
  return (
    <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0">
        <ZoomPane src={src} alt={label} view={view} onView={onView} loading={loading} />
      </div>
      <div className="px-1 pt-1">{select}</div>
    </div>
  )
}

// Both photos full screen. Linked (the default), pinching or dragging one
// zooms both the same way, so the same spot can be looked at side by side.
function CompareFullScreen({ before, after, angleLabel, renderSelect, onClose }) {
  const { t, lang } = useLanguage()
  const [linked, setLinked] = useState(true)
  const [layout, setLayout] = useState('cols')
  const [views, setViews] = useState([UNZOOMED, UNZOOMED])
  const closeBtn = useRef(null)
  const stage = useRef(null)
  const close = useBackToClose(onClose)
  useFullScreen(closeBtn)

  useEffect(() => setViews([UNZOOMED, UNZOOMED]), [layout])

  function setView(i, v) {
    setViews((vs) => (linked ? [v, v] : vs.map((x, j) => (j === i ? v : x))))
  }
  function zoomBy(k) {
    const pane = stage.current?.firstElementChild?.getBoundingClientRect()
    if (!pane) return
    setViews((vs) => vs.map((v) => zoomAt(v, k, 0, 0, pane.width, pane.height, true)))
  }
  function toggleLink() {
    // Linking again lines the second photo up with the first.
    setViews((vs) => (linked ? vs : [vs[0], vs[0]]))
    setLinked((l) => !l)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === '+' || e.key === '=') zoomBy(1.5)
      else if (e.key === '-') zoomBy(1 / 1.5)
      else if (e.key === '0') setViews([UNZOOMED, UNZOOMED])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const zoomed = views.some((v) => v.s > 1)
  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-black flex flex-col text-chalk"
      role="dialog"
      aria-modal="true"
      aria-label={t('photos.compareTitle')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <IconButton label={t('common.close')} onClick={close} btnRef={closeBtn}>
          <X size={22} />
        </IconButton>
        <div className="flex-1 min-w-0 px-1 text-sm truncate">{angleLabel}</div>
        <IconButton label={t('photos.linkZoom')} onClick={toggleLink} pressed={linked}>
          {linked ? <Link size={19} /> : <Unlink size={19} />}
        </IconButton>
        <IconButton
          label={layout === 'cols' ? t('photos.layoutRows') : t('photos.layoutCols')}
          onClick={() => setLayout((l) => (l === 'cols' ? 'rows' : 'cols'))}
        >
          {layout === 'cols' ? <Rows2 size={19} /> : <Columns2 size={19} />}
        </IconButton>
      </div>

      <div ref={stage} className={`flex-1 min-h-0 flex gap-1 px-1 ${layout === 'cols' ? 'flex-row' : 'flex-col'}`}>
        {[
          [before, 'before', t('photos.before')],
          [after, 'after', t('photos.after')],
        ].map(([p, which, label], i) => (
          <ComparePane
            key={which}
            photo={p}
            label={p ? `${label}, ${fullDate(lang, p.taken_on)}` : label}
            view={views[i]}
            onView={(v) => setView(i, v)}
            select={renderSelect(which, p, label, 'bg-surface2/90')}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-1 px-2 py-2">
        <IconButton label={t('photos.zoomOut')} onClick={() => zoomBy(1 / 1.5)} disabled={!zoomed}>
          <ZoomOut size={20} />
        </IconButton>
        <IconButton label={t('photos.zoomReset')} onClick={() => setViews([UNZOOMED, UNZOOMED])} disabled={!zoomed}>
          <RotateCcw size={18} />
        </IconButton>
        <IconButton label={t('photos.zoomIn')} onClick={() => zoomBy(1.5)}>
          <ZoomIn size={20} />
        </IconButton>
      </div>
      <p className="sr-only">{t('photos.compareHint')}</p>
    </div>,
    document.body,
  )
}

// Two photos of the same angle side by side: the latest against the previous
// update by default, or against the first, or any two dates. Used on the coach's trainee page and
// on the trainee's own Weight page.
export default function PhotoCompare({ photos }) {
  const { t, lang } = useLanguage()
  const angles = ANGLES.filter((a) => photos.some((p) => p.angle === a))
  const [angle, setAngle] = useState(angles[0])
  const current = angles.includes(angle) ? angle : angles[0]

  // Oldest first; one photo per date (the latest added that day).
  const byDate = useMemo(() => {
    const m = new Map()
    for (const p of photos.filter((x) => x.angle === current)) {
      const prev = m.get(p.taken_on)
      if (!prev || p.created_at > prev.created_at) m.set(p.taken_on, p)
    }
    return [...m.values()].sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1))
  }, [photos, current])

  // 'previous': latest against the update before it; 'first': latest
  // against the very first. Picking a date by hand switches to 'custom'.
  const [pair, setPair] = useState('previous')
  const [beforeDate, setBeforeDate] = useState(null)
  const [afterDate, setAfterDate] = useState(null)
  const [fullScreen, setFullScreen] = useState(false)
  useEffect(() => {
    setPair((p) => (p === 'custom' ? 'previous' : p))
  }, [current])

  if (!angles.length) return null
  const latest = byDate.length > 1 ? byDate.at(-1) : null
  const preset = pair === 'first' ? byDate[0] : byDate.at(-2) || byDate[0]
  let before = pair === 'custom' ? byDate.find((p) => p.taken_on === beforeDate) || preset : preset
  let after = pair === 'custom' && latest ? byDate.find((p) => p.taken_on === afterDate) || latest : latest
  // Two dates picked the wrong way round still read as before -> after.
  if (before && after && before.taken_on > after.taken_on) [before, after] = [after, before]

  function pick(which, date) {
    setBeforeDate(which === 'before' ? date : before?.taken_on)
    setAfterDate(which === 'after' ? date : after?.taken_on)
    setPair('custom')
  }
  const angleLabel = t(`photos.angle.${current}`)
  function renderSelect(which, p, label, extra = '') {
    return byDate.length > 1 ? (
      <select aria-label={label} value={p?.taken_on || ''} onChange={(e) => pick(which, e.target.value)} className={`w-full text-sm ${extra}`}>
        {byDate.map((x) => (
          <option key={x.taken_on} value={x.taken_on}>
            {fullDate(lang, x.taken_on)}
          </option>
        ))}
      </select>
    ) : (
      <span className="text-xs text-chalkdim num">{p ? fullDate(lang, p.taken_on) : ''}</span>
    )
  }
  const days = before && after ? Math.round((new Date(after.taken_on) - new Date(before.taken_on)) / 86400000) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center">
        {angles.length > 1 && (
          <div role="tablist" className="flex gap-1 bg-surface2 rounded-[12px] p-1">
            {angles.map((a) => (
              <button
                key={a}
                role="tab"
                aria-selected={a === current}
                onClick={() => setAngle(a)}
                className={`px-3 min-h-9 rounded-[9px] text-sm ${a === current ? 'bg-surface text-chalk' : 'text-chalkdim'}`}
              >
                {t(`photos.angle.${a}`)}
              </button>
            ))}
          </div>
        )}
        {byDate.length > 2 && (
          <div className="flex gap-1 bg-surface2 rounded-[12px] p-1" role="group" aria-label={t('photos.compareWith')}>
            {['previous', 'first'].map((k) => (
              <button
                key={k}
                aria-pressed={pair === k}
                onClick={() => setPair(k)}
                className={`px-3 min-h-9 rounded-[9px] text-sm ${pair === k ? 'bg-surface text-chalk' : 'text-chalkdim'}`}
              >
                {t(`photos.vs.${k}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 max-w-2xl">
        {[
          [before, 'before', t('photos.before')],
          [after, 'after', t('photos.after')],
        ].map(([p, which, label]) => (
          <div key={which} className="flex flex-col gap-1.5 min-w-0">
            <div className="aspect-[3/4] rounded-[12px] bg-surface2 overflow-hidden flex items-center justify-center">
              {p ? (
                <ComparePhoto photo={p} alt={`${label}: ${angleLabel}, ${fullDate(lang, p.taken_on)}. ${t('photos.tapToEnlarge')}`} onOpen={() => setFullScreen(true)} />
              ) : (
                <span className="text-xs text-chalkdim px-4 text-center">{t('photos.oneSoFar')}</span>
              )}
            </div>
            {renderSelect(which, p, label)}
          </div>
        ))}
      </div>
      {after && (
        <button type="button" onClick={() => setFullScreen(true)} className="self-start inline-flex items-center gap-1.5 text-sm text-chalk min-h-[44px] -my-1">
          <Maximize2 size={15} /> {t('photos.compareFullScreen')}
        </button>
      )}
      {byDate.length > 1 && days > 0 && <p className="text-xs text-chalkdim">{t('photos.daysApart')(days)}</p>}
      {fullScreen && after && (
        <CompareFullScreen
          before={before}
          after={after}
          angleLabel={byDate.length > 1 && days > 0 ? `${angleLabel} · ${t('photos.daysApart')(days)}` : angleLabel}
          renderSelect={renderSelect}
          onClose={() => setFullScreen(false)}
        />
      )}
    </div>
  )
}
