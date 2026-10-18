import React, { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { ANGLES } from '../lib/photos.js'

function fullDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

// Two photos of the same angle side by side: the earliest and the latest by
// default, either date can be changed. Used on the coach's trainee page and
// on the trainee's own Weight page.
export default function PhotoCompare({ photos, urls }) {
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

  const [beforeDate, setBeforeDate] = useState(null)
  const [afterDate, setAfterDate] = useState(null)
  useEffect(() => {
    setBeforeDate(null)
    setAfterDate(null)
  }, [current])

  if (!angles.length) return null
  const before = byDate.find((p) => p.taken_on === beforeDate) || byDate[0]
  const after = byDate.length > 1 ? byDate.find((p) => p.taken_on === afterDate) || byDate.at(-1) : null
  const days = before && after ? Math.round((new Date(after.taken_on) - new Date(before.taken_on)) / 86400000) : 0

  return (
    <div className="flex flex-col gap-3">
      {angles.length > 1 && (
        <div role="tablist" className="flex gap-1 bg-surface2 rounded-[12px] p-1 self-start">
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

      <div className="grid grid-cols-2 gap-2 max-w-2xl">
        {[
          [before, setBeforeDate, t('photos.before')],
          [after, setAfterDate, t('photos.after')],
        ].map(([p, setDate, label], i) => (
          <div key={i} className="flex flex-col gap-1.5 min-w-0">
            <div className="aspect-[3/4] rounded-[12px] bg-surface2 overflow-hidden flex items-center justify-center">
              {p && urls[p.path] ? (
                <img src={urls[p.path]} alt={`${t(`photos.angle.${current}`)}, ${fullDate(lang, p.taken_on)}`} className="w-full h-full object-contain" />
              ) : !p ? (
                <span className="text-xs text-chalkdim px-4 text-center">{t('photos.oneSoFar')}</span>
              ) : null}
            </div>
            {byDate.length > 1 ? (
              <select
                aria-label={label}
                value={p?.taken_on || ''}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm"
              >
                {byDate.map((x) => (
                  <option key={x.taken_on} value={x.taken_on}>
                    {fullDate(lang, x.taken_on)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-chalkdim num">{p ? fullDate(lang, p.taken_on) : ''}</span>
            )}
          </div>
        ))}
      </div>
      {byDate.length > 1 && days > 0 && <p className="text-xs text-chalkdim">{t('photos.daysApart')(days)}</p>}
    </div>
  )
}
