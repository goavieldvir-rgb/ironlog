// Barcode decoding, loaded on demand (dynamic import from Nutrition.jsx) so
// the ponyfill and its wasm never touch the main bundle.
//
// Prefers the browser's native BarcodeDetector when it can read EAN-13;
// otherwise uses the `barcode-detector` ponyfill (zxing-wasm). The wasm file
// is bundled with the app (Vite emits it into dist/assets) instead of being
// fetched from jsDelivr, which is the library's default.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

let detectorPromise = null

async function createDetector() {
  const native = typeof window !== 'undefined' ? window.BarcodeDetector : null
  if (native) {
    try {
      const supported = await native.getSupportedFormats()
      if (supported.includes('ean_13')) {
        const formats = FORMATS.filter((f) => supported.includes(f))
        return { engine: 'native', detector: new native({ formats }) }
      }
    } catch {
      // fall through to the ponyfill
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  // Download and compile the wasm now (not on the first frame), so a load
  // failure surfaces here and the first scan doesn't wait for it.
  await prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL(wasmUrl, document.baseURI).href : prefix + path),
    },
    fireImmediately: true,
  })
  return { engine: 'wasm', detector: new BarcodeDetector({ formats: FORMATS }) }
}

export function getDetector() {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch((err) => {
      detectorPromise = null
      throw err
    })
  }
  return detectorPromise
}

// UPC-E is a compressed UPC-A whose check digit belongs to the expanded code,
// so expand it before validating or looking it up.
function upcEToUpcA(code) {
  if (!/^[01]\d{7}$/.test(code)) return code
  const [ns, d1, d2, d3, d4, d5, d6, check] = code
  let body
  if ('012'.includes(d6)) body = d1 + d2 + d6 + '0000' + d3 + d4 + d5
  else if (d6 === '3') body = d1 + d2 + d3 + '00000' + d4 + d5
  else if (d6 === '4') body = d1 + d2 + d3 + d4 + '00000' + d5
  else body = d1 + d2 + d3 + d4 + d5 + '0000' + d6
  return ns + body + check
}

// Returns the first detected code's value (UPC-E expanded to UPC-A), or null.
export async function detectFrom(source) {
  const { detector } = await getDetector()
  const found = await detector.detect(source)
  if (!found.length) return null
  const { rawValue, format } = found[0]
  return format === 'upc_e' ? upcEToUpcA(rawValue) : rawValue
}
