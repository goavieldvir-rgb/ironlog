import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Dumbbell, Play, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { exerciseClipFor } from '../lib/exerciseClips.js'
import { demoVideoFor, resolveExerciseVideo } from '../lib/demoVideos.js'
import { VideoModal } from './ExerciseVideo.jsx'

// The small picture at the start of an exercise's name: a still of our own
// animation, at the peak of the rep. Tapping it opens the clip full screen.
//
//   chosen   the coach's pick for this exercise (exercises.clip), if any
//   names    names to match a clip by, English first (a Hebrew display
//            name never matches)
//   videoUrl the coach's own video link, used when there is no clip
//   label    the name shown to the person, for the player's title
//
// With no clip it stays as a grey tile of the same size, so names in a list
// line up; a coach's own link turns that tile into a play button.
export default function ExerciseThumb({ chosen, names = [], videoUrl, label, size = 40, className = '' }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const clip = exerciseClipFor(chosen, names)
  const own = !clip && String(videoUrl || '').trim() ? resolveExerciseVideo({ videoUrl }) : null
  // Nested-corner rule: about a quarter of the side (12 px at 52 px).
  const radius = Math.round(size * 0.23)
  const box = { width: size, height: size, borderRadius: radius }
  // Small tiles still get a 44 px touch area, without taking more room.
  const hit = size < 44 ? "after:absolute after:-inset-1 after:content-['']" : ''

  if (!clip && !own) {
    return (
      <span
        className={`shrink-0 inline-flex items-center justify-center bg-surface2 text-chalkdim/70 ${className}`}
        style={box}
        title={t('clips.noClip')}
        aria-hidden="true"
      >
        <Dumbbell size={Math.round(size * 0.42)} strokeWidth={1.75} />
      </span>
    )
  }

  if (!clip) {
    const title = t('sessionCard.exampleOf', { name: label })
    const look = `relative shrink-0 inline-flex items-center justify-center bg-surface2 text-accent ${hit} ${className}`
    const icon = <Play size={Math.round(size * 0.4)} fill="currentColor" strokeWidth={0} />
    if (own.kind === 'link') {
      return (
        <a href={own.url} target="_blank" rel="noreferrer" className={look} style={box} title={title} aria-label={title}>
          {icon}
        </a>
      )
    }
    return (
      <>
        <button type="button" className={`press ${look}`} style={box} onClick={() => setOpen(true)} title={title} aria-label={title}>
          {icon}
        </button>
        {open && <VideoModal video={own} name={label} onClose={() => setOpen(false)} />}
      </>
    )
  }

  const title = t('clips.open', { name: label })
  // The built-in YouTube video, kept as a quiet "in-depth explanation" link
  // inside the player, so it isn't mistaken for another quick example.
  const deepDemo = names.reduce((found, n) => found || (n ? demoVideoFor(n) : null), null)
  const deep = deepDemo ? { kind: 'embed', id: deepDemo.id, start: deepDemo.start, end: deepDemo.end, builtIn: true } : null
  return (
    <>
      <button
        type="button"
        className={`press relative shrink-0 bg-white ${hit} ${className}`}
        style={box}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={title}
        aria-label={title}
      >
        <img
          src={clip.still}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable="false"
          className="block w-full h-full object-cover"
          style={{ borderRadius: radius }}
        />
        {/* A faint edge so the white still doesn't glare on the dark card. */}
        <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" style={{ borderRadius: radius }} />
      </button>
      {open === true && (
        <ClipPlayer clip={clip} name={label} deepDive={!!deep} onDeepDive={() => setOpen('deep')} onClose={() => setOpen(false)} />
      )}
      {open === 'deep' && <VideoModal video={deep} name={label} onClose={() => setOpen(true)} />}
    </>
  )
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// Full-screen player. The clip loops silently (the renders have no sound),
// starts on its still so there's no black flash, and fits the shorter side
// of the screen so it works upright and sideways. Closes with the X, a tap
// outside the video, a swipe down, or Escape.
export function ClipPlayer({ clip, name, onClose, deepDive = false, onDeepDive }) {
  const { t } = useLanguage()
  useScrollLock(true)
  const [tab, setTab] = useState('main')
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [progress, setProgress] = useState(0)
  const [drag, setDrag] = useState(0)
  const video = useRef(null)
  const touch = useRef(null)
  const close = useRef(null)
  const src = tab === 'tips' && clip.tips ? clip.tips : clip.video

  useEffect(() => {
    close.current?.focus()
    // Capture, so Escape closes only the player and not a dialog under it.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // A new tab starts from the top and plays (unless reduced motion is on).
  useEffect(() => {
    const v = video.current
    if (!v) return
    setProgress(0)
    if (prefersReducedMotion()) {
      setPaused(true)
      return
    }
    setPaused(false)
    v.play?.().catch(() => setPaused(true))
  }, [src])

  function toggle() {
    const v = video.current
    if (!v) return
    if (v.paused) {
      v.play().then(() => setPaused(false)).catch(() => {})
    } else {
      v.pause()
      setPaused(true)
    }
  }

  const tabClass = (on) =>
    `flex-1 min-h-[40px] rounded-full text-sm font-medium transition-colors ${on ? 'bg-chalk text-ink' : 'text-chalkdim hover:text-chalk'}`

  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-ink/95 backdrop-blur-md flex flex-col items-center justify-center px-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientY
      }}
      onTouchMove={(e) => {
        if (touch.current == null) return
        setDrag(Math.max(0, e.touches[0].clientY - touch.current))
      }}
      onTouchEnd={() => {
        if (drag > 90) onClose()
        touch.current = null
        setDrag(0)
      }}
    >
      <div
        className="w-full flex flex-col gap-3 animate-sheet"
        style={{
          maxWidth: 'min(560px, calc(100dvh - 190px))',
          minWidth: 'min(240px, 100%)',
          transform: drag ? `translateY(${drag}px)` : undefined,
          opacity: drag ? Math.max(0.4, 1 - drag / 400) : undefined,
          transition: drag ? 'none' : 'transform 200ms, opacity 200ms',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold min-w-0 truncate">{name}</h2>
          <button
            ref={close}
            type="button"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -me-2 rounded-full hover:bg-surface2 text-chalkdim hover:text-chalk shrink-0"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        {clip.tips && (
          <div className="flex gap-1 p-1 rounded-full bg-surface" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'main'} className={tabClass(tab === 'main')} onClick={() => setTab('main')}>
              {t('clips.exercise')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'tips'} className={tabClass(tab === 'tips')} onClick={() => setTab('tips')}>
              {t('clips.tips')}
            </button>
          </div>
        )}

        <button
          type="button"
          className="relative w-full aspect-square rounded-[22px] overflow-hidden bg-white"
          onClick={toggle}
          aria-label={paused ? t('clips.play') : t('clips.pause')}
          dir="ltr"
        >
          <video
            key={src}
            ref={video}
            src={src}
            poster={tab === 'main' ? clip.still : undefined}
            className="absolute inset-0 w-full h-full object-contain"
            autoPlay={!prefersReducedMotion()}
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration) setProgress(v.currentTime / v.duration)
            }}
            onPause={() => setPaused(true)}
            onPlay={() => setPaused(false)}
          />
          {paused && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/10">
              <span className="w-16 h-16 rounded-full bg-ink/70 text-chalk flex items-center justify-center">
                <Play size={26} fill="currentColor" strokeWidth={0} className="ms-1" />
              </span>
            </span>
          )}
          {tab === 'tips' && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
              <span className="block h-full bg-accent" style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </button>

        {/* The longer YouTube explanation: plain small text, no play mark or
            tile, so it reads as "more reading" and not as another clip. */}
        {deepDive && (
          <button
            type="button"
            onClick={onDeepDive}
            className="self-center inline-flex items-center gap-1 min-h-[44px] px-2 text-[13px] text-chalkdim hover:text-chalk"
          >
            {t('clips.deepDive')}
            <ChevronRight size={14} className="rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
