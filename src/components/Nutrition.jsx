import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { ScanBarcode, Search, Camera, X, RefreshCw, ImagePlus } from 'lucide-react'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock } from '../lib/scrollLock.js'
import { Button, Card } from './ui.jsx'

// Admin-only barcode scanner test screen (nutrition beta, milestone 1).
// The scanner is an overlay inside this page on purpose: changing the URL
// hash while the camera is open makes iOS WebKit ask for camera permission
// again (WebKit bug 215884), so scanning never navigates.

const OFF_FIELDS =
  'code,product_name,product_name_he,product_name_en,brands,quantity,serving_size,nutriments,image_front_small_url'
const SCAN_INTERVAL_MS = 200

// 8 (EAN-8), 12 (UPC-A) and 13 (EAN-13) digits, with a valid check digit.
function validateBarcode(raw) {
  const code = String(raw || '').trim()
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  let sum = 0
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w
  return (10 - (sum % 10)) % 10 === check
}

function num(v, digits = 1) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return String(Math.round(n * 10 ** digits) / 10 ** digits)
}

function displayMode() {
  try {
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
  } catch {
    // ignore
  }
  return 'browser'
}

function shortUA() {
  const ua = navigator.userAgent || ''
  const os = (ua.match(/(iPhone OS|CPU OS|Android|Windows NT|Mac OS X|Linux)[ _]?([\d._]*)/) || [])
  const browser = ua.match(/(Edg|Chrome|CriOS|FxiOS|Firefox|Version)\/([\d.]+)/)
  const osText = os[1] ? `${os[1]} ${(os[2] || '').replace(/_/g, '.')}`.trim() : ''
  const brText = browser ? `${browser[1]} ${browser[2].split('.')[0]}` : ''
  return [osText, brText].filter(Boolean).join(' · ') || ua.slice(0, 60)
}

function productName(p, lang) {
  const order = lang === 'he' ? ['product_name_he', 'product_name'] : ['product_name_en', 'product_name']
  for (const k of [...order, 'product_name', 'product_name_en', 'product_name_he']) {
    if (p[k] && String(p[k]).trim()) return String(p[k]).trim()
  }
  return null
}

export default function Nutrition() {
  const { isAdmin, loadingProfile } = useAdmin()
  if (loadingProfile) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return <NutritionPage />
}

function NutritionPage() {
  const { t, lang } = useLanguage()
  const [manual, setManual] = useState('')
  // result: { status: 'loading'|'found'|'notfound'|'error'|'invalid'|'weighed'|'nophoto', code, product }
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  // 'starting' | 'live' | 'ended' | 'error'
  const [cam, setCam] = useState('starting')
  const [camError, setCamError] = useState('')
  const [diag, setDiag] = useState({ engine: '—', firstMs: null, firstSource: '', perm: '—' })
  const [photoBusy, setPhotoBusy] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const activeRef = useRef(false) // decode loop should run
  const busyRef = useRef(false)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)
  const startedAtRef = useRef(0)
  const firstLoggedRef = useRef(false)
  const lookupSeq = useRef(0)
  const lastLookedUp = useRef('')

  useScrollLock(scanning)

  const stopCamera = useCallback(() => {
    activeRef.current = false
    cancelAnimationFrame(rafRef.current)
    const stream = streamRef.current
    streamRef.current = null
    if (stream) stream.getTracks().forEach((tr) => tr.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Camera permission, where the browser can tell us (Safari can't).
  const refreshPerm = useCallback(async () => {
    try {
      if (!navigator.permissions?.query) throw new Error('unsupported')
      const status = await navigator.permissions.query({ name: 'camera' })
      setDiag((d) => ({ ...d, perm: status.state }))
    } catch {
      setDiag((d) => ({ ...d, perm: t('nutrition.diagUnknown') }))
    }
  }, [t])

  useEffect(() => {
    refreshPerm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Look-up -----------------------------------------------------------------

  const lookup = useCallback(async (raw) => {
    const code = String(raw || '').trim()
    if (!validateBarcode(code)) {
      setResult({ status: 'invalid', code })
      return
    }
    if (code.length === 13 && code[0] === '2') {
      setResult({ status: 'weighed', code })
      return
    }
    const seq = ++lookupSeq.current
    lastLookedUp.current = code
    setResult({ status: 'loading', code })
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${OFF_FIELDS}`,
      )
      if (seq !== lookupSeq.current) return
      if (res.status === 404) {
        setResult({ status: 'notfound', code })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (seq !== lookupSeq.current) return
      if (data.status === 1 && data.product) setResult({ status: 'found', code, product: data.product })
      else setResult({ status: 'notfound', code })
    } catch (err) {
      if (seq !== lookupSeq.current) return
      console.warn('Open Food Facts lookup failed', err)
      setResult({ status: 'error', code })
    }
  }, [])

  function noteFirstDecode(source) {
    if (firstLoggedRef.current) return
    firstLoggedRef.current = true
    setDiag((d) => ({ ...d, firstMs: Math.round(performance.now() - startedAtRef.current), firstSource: source }))
  }

  // Camera ------------------------------------------------------------------

  const tick = useCallback(
    (now) => {
      if (!activeRef.current) return
      rafRef.current = requestAnimationFrame(tick)
      const video = videoRef.current
      if (busyRef.current || now - lastTickRef.current < SCAN_INTERVAL_MS) return
      if (!video || video.readyState < 2 || !video.videoWidth) return
      lastTickRef.current = now
      busyRef.current = true
      import('../lib/barcodeDecoder.js')
        .then((m) => m.detectFrom(video))
        .then((value) => {
          // Misreads fail the check digit; keep scanning instead of showing an error.
          if (!value || !activeRef.current || !validateBarcode(value)) return
          noteFirstDecode('camera')
          stopCamera()
          setScanning(false)
          lookup(value)
        })
        .catch((err) => console.warn('decode failed', err))
        .finally(() => {
          busyRef.current = false
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookup, stopCamera],
  )

  async function startCamera() {
    stopCamera()
    setCam('starting')
    setCamError('')
    setScanning(true)
    startedAtRef.current = performance.now()
    firstLoggedRef.current = false
    setDiag((d) => ({ ...d, firstMs: null, firstSource: '' }))
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCam('error')
      setCamError(t('nutrition.errInsecure'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current !== stream) return
          activeRef.current = false
          cancelAnimationFrame(rafRef.current)
          setCam('ended')
        })
      })
      // The overlay is rendered by the time the permission prompt is answered,
      // but wait a few frames in case it is not.
      for (let i = 0; i < 20 && !videoRef.current; i++) await new Promise((r) => requestAnimationFrame(r))
      const video = videoRef.current
      if (!video || streamRef.current !== stream) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      setCam('live')
      refreshPerm()
      activeRef.current = true
      lastTickRef.current = 0
      rafRef.current = requestAnimationFrame(tick)
      // Warm the decoder while the user lines up the barcode.
      import('../lib/barcodeDecoder.js')
        .then((m) => m.getDetector())
        .then((d) => setDiag((x) => ({ ...x, engine: d.engine })))
        .catch(() => {})
    } catch (err) {
      console.warn('camera start failed', err)
      refreshPerm()
      setCam('error')
      const name = err?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') setCamError(t('nutrition.errDenied'))
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
        setCamError(t('nutrition.errNoCamera'))
      else setCamError(t('nutrition.errGeneric'))
    }
  }

  function closeScanner() {
    stopCamera()
    setScanning(false)
  }

  // iOS can stop the camera when the app is backgrounded; check on return.
  useEffect(() => {
    if (!scanning) return
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
  }, [scanning])

  useEffect(() => {
    if (!scanning) return
    const onKey = (e) => e.key === 'Escape' && closeScanner()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  // Photo -------------------------------------------------------------------

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setResult(null)
    startedAtRef.current = performance.now()
    firstLoggedRef.current = false
    try {
      const mod = await import('../lib/barcodeDecoder.js')
      const { engine } = await mod.getDetector()
      setDiag((d) => ({ ...d, engine, firstMs: null, firstSource: '' }))
      const bitmap = await createImageBitmap(file)
      let value
      try {
        value = await mod.detectFrom(bitmap)
      } finally {
        bitmap.close?.()
      }
      if (!value) {
        setResult({ status: 'nophoto' })
        return
      }
      noteFirstDecode('photo')
      lookup(value)
    } catch (err) {
      console.warn('photo decode failed', err)
      setResult({ status: 'nophoto' })
    } finally {
      setPhotoBusy(false)
    }
  }

  function submitManual(e) {
    e.preventDefault()
    const code = manual.replace(/\s+/g, '')
    if (!code) return
    lookup(code)
  }

  function scanAnother() {
    setResult(null)
    setManual('')
    lastLookedUp.current = ''
    startCamera()
  }

  const busy = result?.status === 'loading'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="eyebrow mb-1">{t('nutrition.betaTag')}</div>
        <h1 className="text-3xl">{t('nutrition.title')}</h1>
        <p className="text-chalkdim text-sm mt-2">{t('nutrition.betaNote')}</p>
      </div>

      <Card className="flex flex-col gap-4">
        <Button onClick={startCamera} className="w-full min-h-[56px] text-base" disabled={busy}>
          <ScanBarcode size={22} /> {t('nutrition.scanButton')}
        </Button>

        <form onSubmit={submitManual} className="flex flex-col gap-1.5">
          <label htmlFor="nutrition-manual" className="eyebrow">
            {t('nutrition.manualLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="nutrition-manual"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              dir="ltr"
              className="flex-1 min-w-0 num"
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="7290004127329"
            />
            <Button type="submit" variant="subtle" disabled={busy || !manual.trim()}>
              <Search size={16} /> {t('nutrition.lookup')}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">{t('nutrition.photoLabel')}</span>
          <label className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 min-h-[44px] text-sm font-medium border border-line text-chalk hover:bg-surface2 cursor-pointer press has-[:disabled]:opacity-40">
            <ImagePlus size={16} />
            {photoBusy ? t('nutrition.photoBusy') : t('nutrition.photoButton')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onPhoto}
              disabled={photoBusy || busy}
              aria-label={t('nutrition.photoButton')}
            />
          </label>
          <p className="text-chalkdim text-xs">{t('nutrition.photoHint')}</p>
        </div>
      </Card>

      <ResultView result={result} lang={lang} onRetry={() => result?.code && lookup(result.code)} onScanAnother={scanAnother} />

      <Card>
        <h2 className="eyebrow mb-3">{t('nutrition.diagTitle')}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Diag label={t('nutrition.diagEngine')} value={diag.engine === 'native' ? t('nutrition.engineNative') : diag.engine === 'wasm' ? t('nutrition.engineWasm') : '—'} />
          <Diag
            label={t('nutrition.diagFirst')}
            value={diag.firstMs != null ? `${diag.firstMs} ms (${diag.firstSource === 'photo' ? t('nutrition.diagPhoto') : t('nutrition.diagCamera')})` : '—'}
          />
          <Diag label={t('nutrition.diagPerm')} value={diag.perm} />
          <Diag label={t('nutrition.diagDisplay')} value={displayMode() === 'standalone' ? t('nutrition.displayStandalone') : t('nutrition.displayBrowser')} />
          <Diag label={t('nutrition.diagUA')} value={shortUA()} />
        </dl>
      </Card>

      <p className="text-chalkdim text-xs">
        {t('nutrition.attrBefore')}
        <a className="underline hover:text-chalk whitespace-nowrap" href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
          Open Food Facts
        </a>
        {t('nutrition.attrMid')}
        <a className="underline hover:text-chalk whitespace-nowrap" href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">
          Open Database License
        </a>
        {t('nutrition.attrAfter')}
      </p>

      {scanning &&
        createPortal(
          <ScannerOverlay videoRef={videoRef} cam={cam} camError={camError} onClose={closeScanner} onRestart={startCamera} />,
          document.body,
        )}
    </div>
  )
}

function Diag({ label, value }) {
  return (
    <>
      <dt className="text-chalkdim">{label}</dt>
      <dd className="num break-words min-w-0 text-end">
        <bdi>{value}</bdi>
      </dd>
    </>
  )
}

function ScannerOverlay({ videoRef, cam, camError, onClose, onRestart }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={t('nutrition.scanButton')}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover ${cam === 'live' ? '' : 'invisible'}`}
      />

      <div
        className="relative z-10 flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <span className="text-sm text-chalk bg-black/60 rounded-md px-3 py-1.5">{t('nutrition.scanTitle')}</span>
        <button
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full bg-black/60 text-chalk"
          aria-label={t('nutrition.closeScanner')}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6">
        {cam === 'live' && (
          <div
            className="w-full max-w-sm aspect-[5/3] rounded-xl border-2 border-brass"
            style={{ boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)' }}
            aria-hidden="true"
          />
        )}
        {cam === 'starting' && <p className="text-chalk text-sm animate-pulse">{t('nutrition.starting')}</p>}
        {cam === 'ended' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-chalk text-sm max-w-xs">{t('nutrition.cameraEnded')}</p>
            <Button onClick={onRestart} className="min-h-[52px]">
              <RefreshCw size={18} /> {t('nutrition.restartCamera')}
            </Button>
          </div>
        )}
        {cam === 'error' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Camera size={28} className="text-chalkdim" />
            <p className="text-chalk text-sm max-w-xs" role="alert">
              {camError}
            </p>
            <Button variant="subtle" onClick={onClose}>
              {t('nutrition.enterManually')}
            </Button>
          </div>
        )}
      </div>

      <div
        className="relative z-10 px-6 pt-3 text-center"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {cam === 'live' && <p className="text-chalk text-sm bg-black/60 rounded-md px-3 py-1.5 inline-block">{t('nutrition.scanHint')}</p>}
      </div>
    </div>
  )
}

function ResultView({ result, lang, onRetry, onScanAnother }) {
  const { t } = useLanguage()
  if (!result) return null
  const { status, code } = result

  if (status === 'loading') {
    return (
      <Card>
        <p className="text-chalkdim text-sm animate-pulse" role="status">
          {t('nutrition.lookingUp')} <span className="num" dir="ltr">{code}</span>
        </p>
      </Card>
    )
  }

  if (status === 'found') {
    const p = result.product
    const n = p.nutriments || {}
    const name = productName(p, lang) || t('nutrition.unnamed')
    const rows = [
      [t('nutrition.kcal'), num(n['energy-kcal_100g'], 0), 'kcal'],
      [t('nutrition.protein'), num(n.proteins_100g), 'g'],
      [t('nutrition.carbs'), num(n.carbohydrates_100g), 'g'],
      [t('nutrition.fat'), num(n.fat_100g), 'g'],
      [t('nutrition.fiber'), num(n.fiber_100g), 'g'],
    ]
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex gap-3 items-start">
          {p.image_front_small_url ? (
            <img src={p.image_front_small_url} alt="" className="w-20 h-20 rounded-md object-contain bg-white shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-md bg-surface2 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h2 className="text-xl leading-tight break-words"><bdi>{name}</bdi></h2>
            {p.brands && <p className="text-chalkdim text-sm mt-1 break-words"><bdi>{p.brands}</bdi></p>}
            {p.quantity && <p className="text-chalkdim text-sm break-words"><bdi>{p.quantity}</bdi></p>}
            <p className="text-chalkdim text-xs num mt-1" dir="ltr">{code}</p>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">{t('nutrition.per100')}</div>
          <dl className="flex flex-col divide-y divide-line">
            {rows.map(([label, value, unit]) => (
              <div key={label} className="flex items-center justify-between py-2 text-sm">
                <dt className="text-chalkdim">{label}</dt>
                <dd className="num" dir="ltr">
                  {value}
                  {value !== '—' && <span className="text-chalkdim"> {unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <Button variant="subtle" onClick={onScanAnother}>
          <ScanBarcode size={16} /> {t('nutrition.scanAnother')}
        </Button>
      </Card>
    )
  }

  const messages = {
    invalid: ['nutrition.invalid', false],
    weighed: ['nutrition.weighed', false],
    notfound: ['nutrition.notFound', false],
    error: ['nutrition.networkError', true],
    nophoto: ['nutrition.noBarcodeInPhoto', false],
  }
  const [key, canRetry] = messages[status] || []
  if (!key) return null
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm" role="alert">
        {t(key)}
        {code && status !== 'weighed' && (
          <>
            {' '}
            <span className="num text-chalkdim" dir="ltr">{code}</span>
          </>
        )}
      </p>
      <div className="flex gap-2 flex-wrap">
        {canRetry && (
          <Button variant="subtle" onClick={onRetry}>
            <RefreshCw size={16} /> {t('nutrition.retry')}
          </Button>
        )}
        <Button variant="ghost" onClick={onScanAnother}>
          <ScanBarcode size={16} /> {t('nutrition.scanAnother')}
        </Button>
      </div>
    </Card>
  )
}
