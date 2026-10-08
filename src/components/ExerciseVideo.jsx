import React, { useState } from 'react'
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
          <iframe
            className="absolute inset-0 w-full h-full border-0"
            src={youtubeEmbedUrl(video.id, { start: video.start, end: video.end })}
            title={t('sessionCard.exampleOf', { name })}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
