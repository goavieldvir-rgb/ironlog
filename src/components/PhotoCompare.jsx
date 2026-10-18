import React, { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { fmtDate } from '../lib/dates.js'
import { ANGLES } from '../lib/photos.js'

function fullDate(lang, iso) {
  return fmtDate(lang, new Date(iso + 'T00:00:00'), { month: 'short', day: 'numeric', year: 'numeric' })
}

// Two photos of the same angle side by side: the latest against the previous
// update by default, or against the first, or any two dates. Used on the coach's trainee page and
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

  // 'previous': latest against the update before it; 'first': latest
  // against the very first. Picking a date by hand switches to 'custom'.
  const [pair, setPair] = useState('previous')
  const [beforeDate, setBeforeDate] = useState(null)
  const [afterDate, setAfterDate] = useState(null)
  useEffect(() => {
    setPair((p) => (p === 'custom' ? 'previous' : p))
  }, [current])

  if (!angles.length) return null
  const latest = byDate.length > 1 ? byDate.at(-1) : null
  const preset = pair === 'first' ? byDate[0] : byDate.at(-2) || byDate[0]
  const before = pair === 'custom' ? byDate.find((p) => p.taken_on === beforeDate) || preset : preset
  const after = pair === 'custom' && latest ? byDate.find((p) => p.taken_on === afterDate) || latest : latest

  function pick(which, date) {
    setBeforeDate(which === 'before' ? date : before?.taken_on)
    setAfterDate(which === 'after' ? date : after?.taken_on)
    setPair('custom')
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
        ].map(([p, which, label], i) => (
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
                onChange={(e) => pick(which, e.target.value)}
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
