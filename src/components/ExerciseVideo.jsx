import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, X } from 'lucide-react'
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
  return createPortal(
    <div
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-30 flex items-center justify-center px-4 py-4"
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
        <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black" dir="ltr">
          <LoopingClip video={video} title={t('sessionCard.exampleOf', { name })} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

// YouTube's own loop setting always jumps back to 0:00, ignoring the start
// time, so a clip trimmed to just the movement would replay any intro on
// every pass. Driving the player through YouTube's iframe API lets us send
// it back to the clip's start ourselves when it reaches its end.
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

function LoopingClip({ video, title }) {
  const box = useRef(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let player = null
    let cancelled = false
    const start = Number.isFinite(video.start) && video.start > 0 ? Math.floor(video.start) : 0
    const end = Number.isFinite(video.end) && video.end > start ? Math.floor(video.end) : undefined
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
          playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1, start, end },
          events: {
            onReady: (e) => {
              e.target.getIframe()?.setAttribute('title', title)
              e.target.mute()
              e.target.playVideo()
            },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                // loadVideoById keeps the end time; seekTo alone would not.
                e.target.loadVideoById({ videoId: video.id, startSeconds: start, endSeconds: end })
              }
            },
          },
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      player?.destroy?.()
      if (box.current) box.current.textContent = ''
    }
  }, [video.id, video.start, video.end, title])
  // If the iframe API can't load, fall back to a plain embed: it still
  // plays and loops, just from 0:00.
  if (failed) {
    return (
      <iframe
        className="absolute inset-0 w-full h-full border-0"
        src={youtubeEmbedUrl(video.id, { start: video.start, end: video.end })}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }
  return <div ref={box} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />
}
