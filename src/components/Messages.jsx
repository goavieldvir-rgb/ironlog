import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { SendHorizontal, RotateCw, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { dateLocale } from '../lib/dates.js'
import { fetchThread, sendMessage, markThreadRead, clearUnread, refreshUnread, useMessagesState, MESSAGE_MAX } from '../lib/messages.js'
import { LoadError } from './ui.jsx'
import { PageLoader } from './Loading.jsx'

const POLL_MS = 30000

// Time for today's messages, date and time for older ones.
function stamp(lang, iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const loc = dateLocale(lang)
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  const date = d.toLocaleDateString(loc, d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${time}`
}

// The chat itself, used by the trainee's Messages screen and by a trainee's
// coach page. `side` is who is looking: 'trainee' or 'coach'.
export function MessageThread({ traineeId, viewerId, side, listClass = 'max-h-[28rem]', onRead }) {
  const { t, lang } = useLanguage()
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [pending, setPending] = useState([])
  const [text, setText] = useState('')
  const listRef = useRef(null)
  const areaRef = useRef(null)
  const stick = useRef(true)
  const seq = useRef(0)

  const isOther = useCallback((m) => (side === 'trainee' ? m.sender_id !== traineeId : m.sender_id === traineeId), [side, traineeId])

  const load = useCallback(
    async (quiet) => {
      try {
        const data = await fetchThread(traineeId)
        setRows(data)
        setLoadError(null)
        // Opening (or still watching) the thread is what marks the other
        // side's messages read.
        if (document.visibilityState === 'visible' && data.some((m) => !m.read_at && isOther(m))) {
          markThreadRead(traineeId)
            .then(() => {
              if (side === 'trainee') clearUnread()
              onRead?.()
            })
            .catch((e) => console.error(e))
        }
      } catch (e) {
        console.error(e)
        if (!quiet) setLoadError(e)
      }
    },
    [traineeId, side, isOther, onRead],
  )

  // Fresh thread when the trainee changes, then every 30 s while visible.
  useEffect(() => {
    setRows(null)
    setPending([])
    setLoadError(null)
    load(false)
    const tick = () => document.visibilityState === 'visible' && load(true)
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  // Keep the newest message in view, unless the reader scrolled up to read.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [rows, pending])

  function onScroll() {
    const el = listRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function grow() {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }
  useLayoutEffect(grow, [text])

  async function deliver(tmp) {
    try {
      const saved = await sendMessage({ traineeId, senderId: viewerId, body: tmp.body })
      setPending((p) => p.filter((m) => m.id !== tmp.id))
      if (saved) setRows((r) => (r && !r.some((m) => m.id === saved.id) ? [...r, saved] : r))
      else load(true)
      if (side === 'trainee') refreshUnread(viewerId)
    } catch (e) {
      console.error(e)
      setPending((p) => p.map((m) => (m.id === tmp.id ? { ...m, failed: true } : m)))
    }
  }

  function send() {
    const body = text.trim()
    if (!body || body.length > MESSAGE_MAX) return
    const tmp = { id: `tmp-${++seq.current}`, body, created_at: new Date().toISOString(), sender_id: viewerId }
    stick.current = true
    setPending((p) => [...p, tmp])
    setText('')
    deliver(tmp)
  }

  function retry(tmp) {
    setPending((p) => p.map((m) => (m.id === tmp.id ? { ...m, failed: false } : m)))
    deliver(tmp)
  }

  function onKeyDown(e) {
    // Enter sends only where there is a physical keyboard; on phones it
    // stays a newline, and the button sends.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    e.preventDefault()
    send()
  }

  if (loadError && !rows) return <LoadError onRetry={() => (setLoadError(null), load(false))} />
  if (!rows) return <PageLoader />

  const empty = rows.length === 0 && pending.length === 0
  const tooLong = text.length > MESSAGE_MAX

  return (
    <div className="flex flex-col gap-3">
      <div ref={listRef} onScroll={onScroll} role="log" aria-label={t('messages.title')} className={`overflow-y-auto overscroll-contain flex flex-col gap-2 ${listClass}`}>
        {empty && (
          <p className="text-chalkdim text-sm text-center py-8 px-4 my-auto">{side === 'trainee' ? t('messages.emptyTrainee') : t('messages.emptyCoach')}</p>
        )}
        {rows.map((m) => (
          <Bubble key={m.id} own={m.sender_id === viewerId} body={m.body} meta={stamp(lang, m.created_at)} seen={m.sender_id === viewerId && !!m.read_at} t={t} />
        ))}
        {pending.map((m) => (
          <Bubble key={m.id} own body={m.body} meta={m.failed ? t('messages.notSent') : t('messages.sending')} failed={m.failed} t={t}
            onRetry={() => retry(m)} onDiscard={() => setPending((p) => p.filter((x) => x.id !== m.id))} />
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('messages.placeholder')}
          aria-label={t('messages.placeholder')}
          className="flex-1 min-w-0 min-h-11 max-h-36 resize-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || tooLong}
          aria-label={t('messages.send')}
          title={t('messages.send')}
          className="press shrink-0 w-11 h-11 rounded-full bg-accent text-ink flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
        >
          <SendHorizontal size={20} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </div>
      {tooLong && <p className="text-xs text-accent num">{t('messages.tooLong')(MESSAGE_MAX)}</p>}
    </div>
  )
}

function Bubble({ own, body, meta, seen, failed, onRetry, onDiscard, t }) {
  return (
    <div className={`flex flex-col gap-0.5 ${own ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-[15px] leading-5 whitespace-pre-wrap break-words ${own ? 'bg-accent text-ink' : 'bg-surface2 text-chalk'} ${failed ? 'opacity-60' : ''}`}>
        <bdi dir="auto">{body}</bdi>
      </div>
      <div className="flex items-center gap-2 px-1 text-[11px] text-chalkdim">
        <span className={failed ? 'text-accent' : ''}>
          <bdi>{meta}</bdi>
          {seen && <> · {t('messages.seen')}</>}
        </span>
        {failed && (
          <>
            <button type="button" onClick={onRetry} className="press inline-flex items-center gap-1 min-h-11 px-1 text-chalk text-xs">
              <RotateCw size={13} aria-hidden="true" /> {t('messages.retry')}
            </button>
            <button type="button" onClick={onDiscard} className="press inline-flex items-center justify-center min-h-11 min-w-11 text-chalkdim" aria-label={t('messages.discard')}>
              <X size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// The trainee's screen: the thread with their coach.
export default function Messages() {
  const { user } = useAuth()
  const { isAdmin } = useAdmin()
  const { t } = useLanguage()
  const { enabled } = useMessagesState()
  // A coach has the thread on each trainee's page; before the SQL runs
  // there is nothing to show.
  if (isAdmin || !enabled) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="eyebrow mb-1">{t('messages.coach')}</div>
        <h1 className="text-[30px] leading-9">{t('messages.title')}</h1>
      </div>
      <MessageThread traineeId={user.uid} viewerId={user.uid} side="trainee" listClass="min-h-[40dvh] max-h-[calc(100dvh-22rem)]" />
    </div>
  )
}
