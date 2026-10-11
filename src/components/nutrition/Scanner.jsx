import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Flashlight, Keyboard, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useScrollLock } from '../../lib/scrollLock.js'
import { Button } from '../ui.jsx'
import { fmt, foodName, isWeighedLabel, resolveBarcode, validateBarcode } from '../../lib/nutrition.js'
import { useAmount } from './useAmount.js'
import { MealSelect, N, Name, OffAttribution, SourceLabel, Stepper, mealLabel } from './parts.jsx'

// The scanner is an overlay on purpose: changing the URL hash while the
// camera is open makes iOS WebKit ask for camera permission again
// (WebKit bug 215884), so scanning never navigates.

const SCAN_INTERVAL_MS = 120
// Decode only the strip around the guide box, scaled down: far less work per
// frame than the whole camera picture, so codes read sooner.
const CROP_W = 0.8
const CROP_H = 0.3
const MAX_DECODE_W = 960

function cropFrame(video, canvas) {
  const sw = Math.round(video.videoWidth * CROP_W)
  const sh = Math.round(video.videoHeight * CROP_H)
  const sx = Math.round((video.videoWidth - sw) / 2)
  const sy = Math.round((video.videoHeight - sh) / 2)
  const scale = Math.min(1, MAX_DECODE_W / sw)
  const w = Math.round(sw * scale)
  const h = Math.round(sh * scale)
  // Resizing a canvas clears it and reallocates; only do it when it changes.
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
  return canvas
}

// Loads the decoder chunk and its wasm. Fails after a deploy in a tab that
// still references the old chunk names; callers show a reload prompt.
function loadDecoder() {
  return import('../../lib/barcodeDecoder.js').then((m) => m.getDetector().then((d) => ({ m, engine: d.engine })))
}

export default function Scanner({ uid, meal, setMeal, onClose, onNotFound, onAdd }) {
  const { t, lang } = useLanguage()
  const [manual, setManual] = useState('')
  const [showManual, setShowManual] = useState(false)
  // result: { status: 'loading'|'found'|'error'|'invalid'|'weighed'|'decoder', code, food, image }
  const [result, setResult] = useState(null)
  // 'starting' | 'live' | 'ended' | 'error'
  const [cam, setCam] = useState('starting')
  const [camError, setCamError] = useState('')
  const [torch, setTorch] = useState({ available: false, on: false })

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const activeRef = useRef(false) // decode loop should run
  const busyRef = useRef(false)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)
  const lookupSeq = useRef(0)
  const startSeq = useRef(0)
  const canvasRef = useRef(null)
  const mountedRef = useRef(true)

  useScrollLock(true)

  const stopCamera = useCallback(() => {
    activeRef.current = false
    cancelAnimationFrame(rafRef.current)
    const stream = streamRef.current
    streamRef.current = null
    if (stream) stream.getTracks().forEach((tr) => tr.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      startSeq.current++
      stopCamera()
    }
  }, [stopCamera])

  const lookup = useCallback(
    async (raw) => {
      const code = String(raw || '').trim()
      if (!validateBarcode(code)) return setResult({ status: 'invalid', code })
      if (isWeighedLabel(code)) return setResult({ status: 'weighed', code })
      const seq = ++lookupSeq.current
      activeRef.current = false
      setResult({ status: 'loading', code })
      try {
        const res = await resolveBarcode(code, uid)
        if (seq !== lookupSeq.current || !mountedRef.current) return
        if (res.status === 'found') setResult({ status: 'found', code, food: res.food, image: res.image })
        else {
          stopCamera()
          onNotFound(code)
        }
      } catch (err) {
        if (seq !== lookupSeq.current) return
        console.warn('barcode lookup failed', err)
        setResult({ status: 'error', code })
      }
    },
    [uid, onNotFound, stopCamera],
  )

  const decoderFailed = useCallback(
    (err) => {
      console.warn('barcode decoder failed to load', err)
      stopCamera()
      setResult({ status: 'decoder' })
    },
    [stopCamera],
  )

  const tick = useCallback(
    (now) => {
      if (!activeRef.current) return
      rafRef.current = requestAnimationFrame(tick)
      const video = videoRef.current
      if (busyRef.current || now - lastTickRef.current < SCAN_INTERVAL_MS) return
      if (!video || video.readyState < 2 || !video.videoWidth) return
      lastTickRef.current = now
      busyRef.current = true
      loadDecoder()
        .catch((err) => {
          decoderFailed(err)
          return null
        })
        .then((loaded) => {
          if (!loaded) return null
          if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
          return loaded.m.detectFrom(cropFrame(video, canvasRef.current))
        })
        .then((value) => {
          // Misreads fail the check digit; keep scanning instead of showing an error.
          if (!value || !activeRef.current || !validateBarcode(value)) return
          activeRef.current = false
          lookup(value)
        })
        .catch((err) => console.warn('decode failed', err))
        .finally(() => {
          busyRef.current = false
        })
    },
    [lookup, decoderFailed],
  )

  const startCamera = useCallback(async () => {
    stopCamera()
    const mine = ++startSeq.current
    setCam('starting')
    setCamError('')
    setResult(null)
    // Fetch and compile the decoder now (the Scan button was just pressed).
    loadDecoder().catch((err) => {
      if (mine === startSeq.current) decoderFailed(err)
    })
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCam('error')
      setCamError(t('nutrition.errInsecure'))
      setShowManual(true)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      if (mine !== startSeq.current) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      track?.addEventListener('ended', () => {
        if (streamRef.current !== stream) return
        activeRef.current = false
        cancelAnimationFrame(rafRef.current)
        setCam('ended')
      })
      let canTorch = false
      try {
        canTorch = !!track?.getCapabilities?.().torch
      } catch {
        // not supported
      }
      setTorch({ available: canTorch, on: false })
      for (let i = 0; i < 20 && !videoRef.current; i++) await new Promise((r) => requestAnimationFrame(r))
      const video = videoRef.current
      if (!video || streamRef.current !== stream) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      setCam('live')
      activeRef.current = true
      lastTickRef.current = 0
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      if (mine !== startSeq.current) return
      console.warn('camera start failed', err)
      setCam('error')
      setShowManual(true)
      const name = err?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') setCamError(t('nutrition.errDenied'))
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') setCamError(t('nutrition.errNoCamera'))
      else setCamError(t('nutrition.errGeneric'))
    }
  }, [stopCamera, tick, decoderFailed, t])

  useEffect(() => {
    startCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // iOS can stop the camera when the app is backgrounded; check on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !streamRef.current) return
      const live = streamRef.current.getVideoTracks().some((tr) => tr.readyState === 'live')
      if (!live) {
        activeRef.current = false
        setCam('ended')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorch({ available: true, on: next })
    } catch (err) {
      console.warn('torch failed', err)
    }
  }

  function submitManual(e) {
    e.preventDefault()
    const code = manual.replace(/\s+/g, '')
    if (code) lookup(code)
  }

  // Back to looking for a code.
  function scanAgain() {
    lookupSeq.current++
    setResult(null)
    setManual('')
    if (cam === 'live' && streamRef.current) {
      activeRef.current = true
      lastTickRef.current = 0
      rafRef.current = requestAnimationFrame(tick)
    } else {
      startCamera()
    }
  }

  const found = result?.status === 'found'
  const scanning = !result && cam === 'live'

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={t('nutrition.scanTitle')}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover ${cam === 'live' ? '' : 'invisible'}`}
      />
      <div className="absolute inset-0 bg-black/30 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <button
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-black/60 border border-white/15 text-chalk"
          aria-label={t('nutrition.closeScanner')}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <h2 className="text-xl text-chalk">{t('nutrition.scanTitle')}</h2>
        <span className="w-11" />
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-6">
        {scanning && (
          <>
            <div className="relative w-[292px] max-w-full h-[158px]" aria-hidden="true">
              {['top-0 start-0 border-t-[3px] border-s-[3px] rounded-ss-md', 'top-0 end-0 border-t-[3px] border-e-[3px] rounded-se-md', 'bottom-0 start-0 border-b-[3px] border-s-[3px] rounded-es-md', 'bottom-0 end-0 border-b-[3px] border-e-[3px] rounded-ee-md'].map((c) => (
                <i key={c} className={`absolute w-8 h-8 border-chalk ${c}`} />
              ))}
            </div>
            <p className="text-chalk text-sm text-center [text-shadow:0_1px_8px_#000]">{t('nutrition.scanHint')}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {torch.available && (
                <button
                  type="button"
                  aria-pressed={torch.on}
                  onClick={toggleTorch}
                  className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-md text-sm font-medium bg-black/60 border ${torch.on ? 'border-chalk text-chalk' : 'border-white/15 text-chalk'}`}
                >
                  <Flashlight size={18} /> {t('nutrition.torch')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                aria-expanded={showManual}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-md text-sm font-medium bg-black/60 border border-white/15 text-chalk"
              >
                <Keyboard size={18} /> {t('nutrition.typeBarcode')}
              </button>
            </div>
          </>
        )}
        {cam === 'starting' && !result && <p className="text-chalk text-sm animate-pulse">{t('nutrition.starting')}</p>}
        {cam === 'ended' && !result && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-chalk text-sm max-w-xs">{t('nutrition.cameraEnded')}</p>
            <Button onClick={startCamera} variant="brass" className="min-h-[52px]">
              <RefreshCw size={18} /> {t('nutrition.restartCamera')}
            </Button>
          </div>
        )}
        {cam === 'error' && !result && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Camera size={28} className="text-chalkdim" />
            <p className="text-chalk text-sm max-w-xs" role="alert">
              {camError}
            </p>
          </div>
        )}
        {showManual && !result && (
          <form onSubmit={submitManual} className="w-full max-w-sm flex gap-2 items-end bg-black/70 border border-white/15 rounded-lg p-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="scan-manual" className="eyebrow block mb-1">
                {t('nutrition.manualLabel')}
              </label>
              <input
                id="scan-manual"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                dir="ltr"
                className="w-full num"
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="7290004127329"
              />
            </div>
            <Button type="submit" variant="brass" disabled={!manual.trim()}>
              <Search size={16} /> {t('nutrition.lookup')}
            </Button>
          </form>
        )}
      </div>

      {result && result.status !== 'found' && (
        <div className="relative z-10 px-4 pb-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <div className="card p-4 flex flex-col gap-3">
            {result.status === 'loading' ? (
              <p className="text-chalkdim text-sm animate-pulse" role="status">
                {t('nutrition.lookingUp')} <N mono>{result.code}</N>
              </p>
            ) : (
              <>
                <p className="text-sm" role="alert">
                  {t(
                    { invalid: 'nutrition.invalid', weighed: 'nutrition.weighed', error: 'nutrition.networkError', decoder: 'nutrition.decoderError' }[result.status],
                  )}
                  {result.code && result.status !== 'weighed' && (
                    <>
                      {' '}
                      <N mono className="text-chalkdim">{result.code}</N>
                    </>
                  )}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {result.status === 'decoder' && (
                    <Button variant="brass" onClick={() => window.location.reload()}>
                      <RefreshCw size={16} /> {t('nutrition.reload')}
                    </Button>
                  )}
                  {result.status === 'error' && (
                    <Button variant="subtle" onClick={() => lookup(result.code)}>
                      <RefreshCw size={16} /> {t('nutrition.retry')}
                    </Button>
                  )}
                  {result.status !== 'decoder' && (
                    <Button variant="ghost" onClick={scanAgain}>
                      {t('nutrition.scanAgain')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {found && (
        <FoundCard
          key={result.food.id || result.code}
          result={result}
          lang={lang}
          meal={meal}
          setMeal={setMeal}
          onAgain={scanAgain}
          onAdd={onAdd}
        />
      )}
    </div>,
    document.body,
  )
}

function FoundCard({ result, lang, meal, setMeal, onAgain, onAdd }) {
  const { t } = useLanguage()
  const { food, image } = result
  const a = useAmount(food)
  const g = t('nutrition.g')
  const name = foodName(food, lang) || t('nutrition.unnamed')
  return (
    <div className="relative z-10 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
      <div className="card p-3.5 flex flex-col gap-2.5">
        <div className="flex gap-3 items-start">
          {image && <img src={image} alt="" className="w-14 h-14 rounded-md object-contain bg-white shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="eyebrow flex items-center gap-2 flex-wrap">
              <SourceLabel food={food} showVerifiedText />
            </div>
            <h3 className="text-xl leading-tight mt-1 line-clamp-2"><bdi>{name}</bdi></h3>
            {food.brand && <Name className="text-chalkdim text-sm">{food.brand}</Name>}
          </div>
          <button type="button" onClick={onAgain} aria-label={t('nutrition.scanAgain')} className="w-11 h-11 -mt-1 -me-1 inline-flex items-center justify-center rounded-md hover:bg-surface2 shrink-0">
            <X size={20} />
          </button>
        </div>
        <Stepper value={a.qty} unit={a.option.kind === 'g' ? g : a.option.kind === '100g' ? '× 100 ' + g : a.option.label} onChange={a.setQty} onStep={a.step} />
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={t('nutrition.unit')} value={a.unitIdx} onChange={(e) => a.setUnit(Number(e.target.value))} className="min-h-[44px]">
            {a.options.map((o, i) => (
              <option key={o.key} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <MealSelect value={meal} onChange={setMeal} />
        </div>
        <div className="flex items-baseline justify-between gap-2 text-sm text-chalkdim">
          <span className="truncate">{t('nutrition.forThisAmount')}</span>
          <span className="whitespace-nowrap">
            <N mono className="text-chalk text-xl">{fmt(a.macros.protein, 1)}</N> {g} {t('nutrition.proteinWord')} · <N mono>{fmt(a.macros.kcal, 0)}</N> {t('nutrition.kcalUnit')}
          </span>
        </div>
        <Button variant="brass" className="w-full min-h-[52px] text-base" disabled={!a.valid} onClick={() => onAdd(food, a.option, a.q, meal)}>
          <Plus size={20} /> {t('nutrition.addToButton', { meal: mealLabel(t, meal) })}
        </Button>
        {food.source === 'off' && <OffAttribution />}
      </div>
    </div>
  )
}
