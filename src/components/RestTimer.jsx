import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Bell, BellOff } from 'lucide-react'
import { InfoTip } from './InfoTip.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { clearRestNotification, isIOS, setRestPush, showRestNotification, swRegistration } from '../lib/push.js'

const PRESETS = [60, 90, 120, 180]
const DEFAULT_REST = 90

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch {
    // Web Audio not available — silently skip the beep.
  }
}

// Notifications only exist in a browser that supports them, and on iPhone
// only when the app was added to the Home Screen — so the bell is hidden
// entirely rather than offering something that can't work.
const canNotify = typeof window !== 'undefined' && 'Notification' in window

// iPhone freezes the app the moment the screen locks, so its lock screen
// notification can't count down: it names the time the rest ends instead.
// Elsewhere (Android) the app keeps running and updates it every second.
const liveLockScreen = typeof navigator !== 'undefined' && !isIOS()

// "1:05", always left to right.
function clockText(seconds) {
  const s = Math.abs(seconds)
  return `\u200E${seconds < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A floating dock that stays hidden until a rest is running. The page starts
// it through the ref (`ref.current.start()`) when a set is ticked off.
const RestTimer = forwardRef(function RestTimer(_props, ref) {
  const { t, lang } = useLanguage()
  const [notifyOn, setNotifyOn] = useState(canNotify && Notification.permission === 'granted')
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_REST)
  const [lastDuration, setLastDuration] = useState(DEFAULT_REST)
  const [running, setRunning] = useState(false)
  // Whether a rest is on screen at all (running, paused or in overtime).
  const [active, setActive] = useState(false)
  const [finished, setFinished] = useState(false)
  const [totalDuration, setTotalDuration] = useState(DEFAULT_REST)
  // Presets and alerts live one tap away so the dock stays slim.
  const [expanded, setExpanded] = useState(false)
  // The actual wall-clock moment the timer should hit zero — not a ticking
  // counter. Mobile browsers throttle or fully pause setInterval while the
  // tab/app is backgrounded, so a counter-based timer silently freezes and
  // "loses" whatever time passed while you were away. Deriving remaining
  // time from a real timestamp means it's always correct the moment you
  // come back, even if not a single tick fired while you were gone.
  const endTimeRef = useRef(null)
  // Whether this run already alerted. The timer keeps going past zero and
  // shows how long you've rested beyond the set time, so the beep must
  // fire once at zero rather than on every overtime tick.
  const alertedRef = useRef(false)
  // Whether the server currently holds an end time for this rest, so it can
  // send the alert while the app is in the background.
  const pushedRef = useRef(false)

  // Tells the server when this rest ends (or that it no longer does).
  function pushRest(end, force = false) {
    if (end && (notifyOn || force)) {
      pushedRef.current = true
      setRestPush(end)
    } else if (pushedRef.current) {
      pushedRef.current = false
      setRestPush(null)
    }
  }

  // Leaving the workout mid-rest cancels the server's alert too.
  useEffect(
    () => () => {
      if (pushedRef.current) setRestPush(null)
      clearRestNotification()
    },
    [],
  )

  // Puts the rest on the lock screen and in the notification shade while
  // you're away from the app: a live countdown, then how far over you are.
  function showLock(remaining, alert = false) {
    const end = endTimeRef.current
    if (!notifyOn || !end) return
    const at = new Date(end).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' })
    const over = remaining <= 0
    let title
    let body
    if (liveLockScreen) {
      title = over ? t('restTimer.lockOver', { time: clockText(remaining) }) : t('restTimer.lockLeft', { time: clockText(remaining) })
      body = over ? t('restTimer.doneBody') : t('restTimer.lockNextAt', { at })
    } else {
      title = over ? t('restTimer.lockEndedAt', { at }) : t('restTimer.lockUntil', { at })
      body = over ? t('restTimer.doneBody') : t('restTimer.lockUntilBody')
    }
    showRestNotification({ title, body, endsAt: end, alert, lang })
  }

  function tick() {
    if (!endTimeRef.current) return
    // Goes negative once time's up: -12 means 12 seconds over.
    const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000)
    setSecondsLeft(remaining)
    const away = document.visibilityState !== 'visible'
    if (remaining <= 0 && !alertedRef.current) {
      alertedRef.current = true
      setFinished(true)
      beep()
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      // Seen on screen already, or about to sound from the live lock screen
      // card below, so the server's push would only repeat it.
      if (!away || (liveLockScreen && notifyOn)) pushRest(null)
      // Only worth a notification when you're not looking at the app —
      // otherwise the screen already shows it's done.
      // Woken long after the end (the phone froze the app), the server's
      // push has sounded already: update the card quietly.
      if (away) showLock(remaining, remaining > -15)
    } else if (away && liveLockScreen) {
      showLock(remaining)
    }
  }

  useEffect(() => {
    if (!running) return
    const interval = setInterval(tick, 1000)
    // Catch up immediately when the tab/app becomes visible again, rather
    // than waiting for the next (possibly long-delayed) interval tick. Coming
    // back also takes the rest off the lock screen, since the dock shows it.
    function onVisibilityChange() {
      tick()
      if (document.visibilityState === 'visible') clearRestNotification()
      // tick() keeps a live one up to date; iPhone gets its one still card here.
      else if (!liveLockScreen && endTimeRef.current) showLock(Math.ceil((endTimeRef.current - Date.now()) / 1000))
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, notifyOn])

  async function toggleNotify() {
    if (notifyOn) {
      setNotifyOn(false)
      pushRest(null)
      return
    }
    // Must be triggered by a real tap — browsers ignore permission
    // requests that aren't tied to a user action.
    const granted = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted'
    setNotifyOn(granted)
    if (granted) swRegistration()
    if (granted && running && endTimeRef.current > Date.now()) pushRest(endTimeRef.current, true)
  }

  function start(preset) {
    // Resuming a timer paused in overtime starts a fresh rest rather than
    // "resuming" from a negative time.
    const duration = preset ?? (secondsLeft > 0 ? secondsLeft : lastDuration)
    if (preset != null) setLastDuration(preset)
    endTimeRef.current = Date.now() + duration * 1000
    pushRest(endTimeRef.current)
    // Ready before the screen locks, when there's no time left to set it up.
    if (notifyOn) swRegistration()
    setSecondsLeft(duration)
    setTotalDuration(duration)
    setFinished(false)
    alertedRef.current = false
    setRunning(true)
    setActive(true)
  }

  useImperativeHandle(ref, () => ({
    // A new rest, at whichever length was used last.
    start: () => start(lastDuration),
  }))

  function pause() {
    setRunning(false)
    pushRest(null)
    clearRestNotification()
  }

  // Restart: go back to whichever duration was actually last used — not a
  // hardcoded default — and start counting down again immediately.
  function restart() {
    start(lastDuration)
  }

  // Nudges the rest by a few seconds, from the stored end time while running
  // (or from the frozen remainder while paused).
  function adjust(delta) {
    if (!running) {
      const next = Math.max(1, secondsLeft + delta)
      setSecondsLeft(next)
      setTotalDuration((d) => Math.max(d, next))
      return
    }
    const end = Math.max(Date.now() + 1000, (endTimeRef.current || Date.now()) + delta * 1000)
    endTimeRef.current = end
    pushRest(end)
    const remaining = Math.ceil((end - Date.now()) / 1000)
    setSecondsLeft(remaining)
    setTotalDuration((d) => Math.max(d, remaining))
    // Pushed back into the future: it should alert again when it gets there.
    setFinished(false)
    alertedRef.current = false
  }

  function skip() {
    endTimeRef.current = null
    pushRest(null)
    clearRestNotification()
    alertedRef.current = false
    setRunning(false)
    setActive(false)
    setFinished(false)
    setExpanded(false)
    setSecondsLeft(lastDuration)
  }

  const overtime = secondsLeft < 0
  const shown = Math.abs(secondsLeft)
  const mm = Math.floor(shown / 60)
  const ss = String(shown % 60).padStart(2, '0')
  // Always "+1:23", left to right, in Hebrew too — the plus sign would
  // otherwise jump to the far side of the digits.
  const clock = (
    <span dir="ltr">
      {overtime ? '+' : ''}
      {mm}:{ss}
    </span>
  )
  const pct = overtime ? 100 : totalDuration > 0 ? Math.min(100, Math.max(0, (1 - secondsLeft / totalDuration) * 100)) : 0

  const dockBtn = 'press h-11 min-w-[52px] rounded-xl text-chalk text-[15px] font-medium'
  const smallBtn = 'press inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-chalkdim hover:text-chalk'

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={t('restTimer.rest')}
      aria-hidden={!active}
      inert={!active ? '' : undefined}
      className={`fixed inset-x-4 mx-auto max-w-[460px] z-20 rounded-[20px] bg-[#232326] overflow-hidden transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
        active ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%+64px)] opacity-0 pointer-events-none'
      }`}
      style={{
        bottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 12px))',
        boxShadow: '0 16px 40px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)',
      }}
    >
      <div className="flex items-center gap-1 h-16 ps-[18px] pe-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? t('restTimer.collapse') : t('restTimer.expand')}
          className="flex-1 min-w-0 h-full flex items-center gap-2.5 text-start"
        >
          <span className="text-sm text-chalkdim">{overtime ? t('restTimer.over') : t('restTimer.rest')}</span>
          <span className="num text-2xl font-semibold tracking-[-0.01em]">{clock}</span>
        </button>
        <button type="button" onClick={() => adjust(-15)} className={dockBtn}>
          <bdi dir="ltr">−15</bdi>
        </button>
        <button type="button" onClick={() => adjust(15)} className={dockBtn}>
          <bdi dir="ltr">+15</bdi>
        </button>
        <button type="button" onClick={skip} className={`${dockBtn} px-3.5 bg-[#34343A]`}>
          {overtime ? t('restTimer.next') : t('restTimer.skip')}
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-1 ps-3 pe-2 pb-2 pt-0.5 border-t border-white/[0.06] flex-wrap">
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  start(p)
                  setExpanded(false)
                }}
                className="press px-2.5 min-h-[44px] min-w-[44px] rounded-xl text-sm num text-chalkdim hover:text-chalk"
              >
                {p}s
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 ms-auto">
            <InfoTip text={t('restTimer.tip')} />
            {canNotify && (
              <button
                type="button"
                onClick={toggleNotify}
                title={notifyOn ? t('restTimer.notifyOn') : t('restTimer.notifyOff')}
                aria-label={notifyOn ? t('restTimer.notifyOn') : t('restTimer.notifyOff')}
                className={`${smallBtn} ${notifyOn ? '!text-chalk' : ''}`}
              >
                {notifyOn ? <Bell size={16} /> : <BellOff size={16} />}
              </button>
            )}
            {running ? (
              <button type="button" onClick={pause} title={t('restTimer.pause')} aria-label={t('restTimer.pause')} className={smallBtn}>
                <Pause size={16} />
              </button>
            ) : (
              <button type="button" onClick={() => start()} title={t('restTimer.start')} aria-label={t('restTimer.start')} className={smallBtn}>
                <Play size={16} />
              </button>
            )}
            <button type="button" onClick={restart} title={t('restTimer.restart')} aria-label={t('restTimer.restart')} className={smallBtn}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-0 start-0 h-[3px] bg-chalk/30 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  )
})

export default RestTimer
