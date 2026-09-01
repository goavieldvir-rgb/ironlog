import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Timer } from 'lucide-react'
import { Button } from './ui.jsx'

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

export default function RestTimer() {
  const [secondsLeft, setSecondsLeft] = useState(90)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          setFinished(true)
          beep()
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  function start(preset) {
    if (preset) setSecondsLeft(preset)
    setFinished(false)
    setRunning(true)
  }

  function pause() {
    setRunning(false)
  }

  function reset(preset = 90) {
    setRunning(false)
    setFinished(false)
    setSecondsLeft(preset)
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div
      className={`sticky bottom-0 z-10 border-t backdrop-blur px-4 py-2.5 flex items-center gap-3 flex-wrap transition-colors ${
        finished ? 'bg-ironsoft border-iron' : 'bg-ink/95 border-line'
      }`}
    >
      <div className="flex items-center gap-2">
        <Timer size={16} className={finished ? 'text-iron' : 'text-chalkdim'} />
        <span className={`num text-2xl leading-none ${finished ? 'text-iron' : 'text-chalk'}`}>
          {mm}:{ss}
        </span>
      </div>

      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => start(p)}
            className="px-2 py-1 rounded text-xs num text-chalkdim hover:text-chalk hover:bg-surface2"
          >
            {p}s
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {running ? (
          <Button variant="subtle" onClick={pause} className="!px-2.5 !py-1.5">
            <Pause size={14} />
          </Button>
        ) : (
          <Button variant="subtle" onClick={() => start()} className="!px-2.5 !py-1.5">
            <Play size={14} />
          </Button>
        )}
        <Button variant="ghost" onClick={() => reset()} className="!px-2.5 !py-1.5">
          <RotateCcw size={14} />
        </Button>
      </div>
    </div>
  )
}
