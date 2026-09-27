import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Timer, Bell, BellOff } from 'lucide-react'
import { Button } from './ui.jsx'
import { InfoTip } from './InfoTip.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

const PRESETS = [60, 90, 120, 180]

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

export default function RestTimer() {
  const { t } = useLanguage()
  const [notifyOn, setNotifyOn] = useState(canNotify && Notification.permission === 'granted')
  const [secondsLeft, setSecondsLeft] = useState(90)
  const [lastDuration, setLastDuration] = useState(90)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  // The actual wall-clock moment the timer should hit zero — not a ticking
  // counter. Mobile browsers throttle or fully pause setInterval while the
  // tab/app is backgrounded, so a counter-based timer silently freezes and
  // "loses" whatever time passed while you were away. Deriving remaining
  // time from a real timestamp means it's always correct the moment you
  // come back, even if not a single tick fired while you were gone.
  const endTimeRef = useRef(null)

  function tick() {
    if (!endTimeRef.current) return
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
    setSecondsLeft(remaining)
    if (remaining <= 0) {
      setRunning(false)
      setFinished(true)
      beep()
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      // Only worth a notification when you're not looking at the app —
      // otherwise the screen already shows it's done.
      if (notifyOn && document.visibilityState !== 'visible') {
        try {
          const n = new Notification(t('restTimer.doneTitle'), {
            body: t('restTimer.doneBody'),
            tag: 'ironlog-rest-timer',
            silent: false,
          })
          n.onclick = () => {
            window.focus()
            n.close()
          }
        } catch {
          // Some browsers only allow notifications via a service worker.
        }
      }
    }
  }

  useEffect(() => {
    if (!running) return
    const interval = setInterval(tick, 1000)
    // Catch up immediately when the tab/app becomes visible again, rather
    // than waiting for the next (possibly long-delayed) interval tick.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') tick()
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
      return
    }
    if (Notification.permission === 'granted') {
      setNotifyOn(true)
      return
    }
    // Must be triggered by a real tap — browsers ignore permission
    // requests that aren't tied to a user action.
    const result = await Notification.requestPermission()
    setNotifyOn(result === 'granted')
  }

  function start(preset) {
    const duration = preset ?? secondsLeft
    if (preset != null) setLastDuration(preset)
    endTimeRef.current = Date.now() + duration * 1000
    setSecondsLeft(duration)
    setFinished(false)
    setRunning(true)
  }

  function pause() {
    setRunning(false)
  }

  // Restart: go back to whichever duration was actually last used — not a
  // hardcoded default — and start counting down again immediately. This is
  // what the button next to Play is for: minimizing taps between sets.
  function restart() {
    start(lastDuration)
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div
      className={`sticky bottom-0 z-10 border-t backdrop-blur px-4 py-2.5 flex items-center gap-3 flex-wrap transition-colors ${
        finished ? 'bg-ironsoft border-iron' : 'bg-ink/95 border-line'
      }`}
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center gap-1.5">
        <Timer size={16} className={finished ? 'text-iron' : 'text-chalkdim'} />
        <span className={`num text-2xl leading-none ${finished ? 'text-iron' : 'text-chalk'}`}>
          {mm}:{ss}
        </span>
        <InfoTip text={t('restTimer.tip')} />
      </div>

      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => start(p)}
            className="press px-2 py-1 rounded text-xs num text-chalkdim hover:text-chalk hover:bg-surface2"
          >
            {p}s
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 ms-auto">
        {canNotify && (
          <button
            onClick={toggleNotify}
            title={notifyOn ? t('restTimer.notifyOn') : t('restTimer.notifyOff')} aria-label={notifyOn ? t('restTimer.notifyOn') : t('restTimer.notifyOff')}
            className={`p-1.5 rounded hover:bg-surface2 ${notifyOn ? 'text-brass' : 'text-chalkdim hover:text-chalk'}`}
          >
            {notifyOn ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
        )}
        {running ? (
          <Button variant="subtle" onClick={pause} className="!px-2.5 !py-1.5">
            <Pause size={14} />
          </Button>
        ) : (
          <Button variant="subtle" onClick={() => start()} className="!px-2.5 !py-1.5">
            <Play size={14} />
          </Button>
        )}
        <Button variant="ghost" onClick={restart} className="!px-2.5 !py-1.5">
          <RotateCcw size={14} />
        </Button>
      </div>
    </div>
  )
}
