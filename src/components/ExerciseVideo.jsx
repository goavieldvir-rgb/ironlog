import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Play, X } from 'lucide-react'
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
        {/* A way out when a clip won't play here (removed, or its owner
            blocks embedding), and the full video with sound and chapters. */}
        <a
          href={watchUrl(video)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brass hover:underline mt-2"
        >
          <ExternalLink size={12} /> {t('sessionCard.openOnYouTube')}
        </a>
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

function watchUrl({ id, start }) {
  const t = Number.isFinite(start) && start > 0 ? `&t=${Math.floor(start)}s` : ''
  return `https://www.youtube.com/watch?v=${id}${t}`
}

// Plain embed: plays muted, loops from 0:00, YouTube's own controls shown so
// a trainee can unmute or scrub.
function PlainClip({ video, title }) {
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

function LoopingClip({ video, title }) {
  const trimmed = (Number.isFinite(video.start) && video.start > 0) || (Number.isFinite(video.end) && video.end > 0)
  if (!trimmed) return <PlainClip video={video} title={title} />
  return <TrimmedClip video={video} title={title} />
}

// Only clips with a start or end time go through the iframe API. If it
// doesn't come up in time, or the player reports an error, the plain embed
// takes over: it still plays, just looping from 0:00.
function TrimmedClip({ video, title }) {
  const box = useRef(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let player = null
    let cancelled = false
    let ready = false
    const start = Number.isFinite(video.start) && video.start > 0 ? Math.floor(video.start) : 0
    const end = Number.isFinite(video.end) && video.end > start ? Math.floor(video.end) : undefined
    const fail = () => !cancelled && setFailed(true)
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
            },
            onError: fail,
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                // loadVideoById keeps the end time; seekTo alone would not.
                e.target.loadVideoById({ videoId: video.id, startSeconds: start, endSeconds: end })
              }
            },
          },
        })
      })
      .catch(fail)
    return () => {
      cancelled = true
      clearTimeout(timer)
      player?.destroy?.()
    }
  }, [video.id, video.start, video.end, title])
  if (failed) return <PlainClip video={video} title={title} />
  return <div ref={box} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0" />
}
