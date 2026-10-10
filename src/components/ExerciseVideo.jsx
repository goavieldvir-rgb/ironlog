import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Volume2, VolumeX, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { resolveExerciseVideo, youtubeEmbedUrl } from '../lib/demoVideos.js'

// The "Example" button every exercise shares. A coach's own non-YouTube link
// still opens in a new tab; everything else (built-in demo clips and
// coach-pasted YouTube links) plays in the same fixed 16:9 frame, so every
// exercise looks and behaves the same.
//
// `name` is what the card shows; `matchNames` are the names tried against
// the built-in clips, English first (entries can carry a Hebrew display
// name, but the clips are matched by the English one).
export default function ExerciseVideo({ name, matchNames = [], videoUrl, className = '', iconSize = 13 }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const video = [name, ...matchNames]
    .filter(Boolean)
    .reduce((found, n) => found || resolveExerciseVideo({ name: n, videoUrl }), null)
  if (!video) return null

  const look = `inline-flex items-center gap-1 text-brass hover:underline w-fit ${className}`

  if (video.kind === 'link') {
    return (
      <a href={video.url} target="_blank" rel="noreferrer" className={look}>
        <Play size={iconSize} /> {t('sessionCard.example')}
      </a>
    )
  }

  return (
    <>
      <button type="button" className={look} onClick={() => setOpen(true)}>
        <Play size={iconSize} /> {t('sessionCard.example')}
      </button>
      {open && <VideoModal video={video} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

function VideoModal({ video, name, onClose }) {
  const { t } = useLanguage()
  useScrollLock(true)
  // YouTube's player on iPhone has no mute or volume button of its own, so
  // the clip's sound is switched from here instead. The phone's side
  // buttons still set how loud it is.
  const player = useRef(null)
  const [ready, setReady] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  // Set when the phone wouldn't let us unmute a playing clip: the clip is
  // then reloaded with sound and waits for a tap on YouTube's play button.
  const [withSound, setWithSound] = useState(false)

  function toggleSound() {
    const p = player.current
    if (!p) return
    if (soundOn) {
      p.mute()
      setSoundOn(false)
      return
    }
    p.unMute()
    p.setVolume?.(100)
    p.playVideo()
    setSoundOn(true)
    setTimeout(() => {
      if (player.current === p && p.isMuted?.()) {
        setReady(false)
        setWithSound(true)
      }
    }, 600)
  }

  const title = t('sessionCard.exampleOf', { name })
  return createPortal(
    <div
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center px-4 py-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="card p-3 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-lg min-w-0 truncate">{name}</h2>
          <button
            type="button"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -me-2 rounded hover:bg-ironsoft text-chalkdim hover:text-irontext shrink-0"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
            autoFocus
          >
            <X size={18} />
          </button>
        </div>
        {/* Same 16:9 frame for every exercise. */}
        <div className="relative w-full aspect-video min-h-[200px] rounded-md overflow-hidden bg-black" dir="ltr">
          {withSound ? (
            <PlainClip video={video} title={title} sound />
          ) : (
            <ApiClip
              video={video}
              title={title}
              soundOn={soundOn}
              onPlayer={(p) => {
                player.current = p
                setReady(!!p)
              }}
            />
          )}
        </div>
        {/* Fixed height so the modal doesn't shift when the button appears
            once the player is ready (or never does, in the fallbacks). */}
        <div className="flex items-center gap-2 mt-1 min-h-[44px]">
          {ready && (
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex items-center gap-1.5 min-h-[44px] -ms-1 px-1 text-sm text-brass"
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {soundOn ? t('sessionCard.soundOff') : t('sessionCard.soundOn')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// The clip is driven through YouTube's iframe API, so the sound button can
// reach it and a clip with a start time loops back to that start rather than
// to 0:00 (YouTube's own loop setting ignores the start time).
let apiPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        resolve(window.YT)
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.onerror = () => {
        apiPromise = null
        reject(new Error('YouTube player failed to load'))
      }
      document.head.appendChild(tag)
    })
  }
  return apiPromise
}

// Plain embed, used when the iframe API can't be used: muted and looping
// from 0:00, or with sound (waiting for a tap on play, since phones won't
// autoplay with sound) after the sound button couldn't unmute it.
function PlainClip({ video, title, sound = false }) {
  return (
    <iframe
      className="absolute inset-0 w-full h-full border-0"
      src={youtubeEmbedUrl(video.id, { start: video.start, end: video.end, sound })}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

// If the API doesn't come up in time, or the player reports an error, the
// plain embed takes over: it still plays, just looping from 0:00 and
// without our sound button.
function ApiClip({ video, title, soundOn, onPlayer }) {
  const box = useRef(null)
  const [failed, setFailed] = useState(false)
  const sound = useRef(soundOn)
  sound.current = soundOn
  const report = useRef(onPlayer)
  report.current = onPlayer
  useEffect(() => {
    let player = null
    let cancelled = false
    let ready = false
    const start = Number.isFinite(video.start) && video.start > 0 ? Math.floor(video.start) : 0
    const end = Number.isFinite(video.end) && video.end > start ? Math.floor(video.end) : undefined
    const fail = () => {
      if (cancelled) return
      report.current(null)
      setFailed(true)
    }
    const timer = setTimeout(() => !ready && fail(), 8000)
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !box.current) return
        // The player swaps this node for its iframe, so it's created here
        // rather than by React, which would otherwise lose track of it.
        const el = document.createElement('div')
        box.current.appendChild(el)
        player = new YT.Player(el, {
          host: 'https://www.youtube-nocookie.com',
          videoId: video.id,
          playerVars: { autoplay: 1, mute: 1, playsinline: 1, controls: 1, rel: 0, modestbranding: 1, start, end },
          events: {
            onReady: (e) => {
              ready = true
              e.target.getIframe()?.setAttribute('title', title)
              e.target.mute()
              e.target.playVideo()
              report.current(e.target)
            },
            onError: fail,
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                // loadVideoById keeps the end time; seekTo alone would not.
                e.target.loadVideoById({ videoId: video.id, startSeconds: start, endSeconds: end })
                if (sound.current) e.target.unMute()
              }
            },
          },
        })
      })
      .catch(fail)
    return () => {
      cancelled = true
      clearTimeout(timer)
      report.current(null)
      player?.destroy?.()
    }
  }, [video.id, video.start, video.end, title])
  if (failed) return <PlainClip video={video} title={title} />
  return <div ref={box} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />
}
