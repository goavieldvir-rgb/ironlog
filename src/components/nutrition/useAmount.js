import { useMemo, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { buildUnitOptions, defaultUnitIndex, lastAmountFor, parseNum, round1, scaleMacros } from '../../lib/nutrition.js'

const round2 = (n) => Math.round(n * 100) / 100

// Where the amount starts: the unit and quantity this food was last logged
// at, else one serving (or 100 g).
function startAmount(food, options) {
  const last = lastAmountFor(food?.id)
  if (last) {
    const u = last.unit_label && last.unit_qty > 0 ? options.findIndex((o) => o.kind === 'unit' && o.label === last.unit_label) : -1
    if (u >= 0) return [u, String(last.unit_qty)]
    const g = options.findIndex((o) => o.kind === 'g')
    return [g, String(round1(last.grams))]
  }
  const i = defaultUnitIndex(options)
  return [i, String(options[i].def)]
}

// Amount state for a food: a unit, a quantity and the resulting macros.
export function useAmount(food) {
  const { t, lang } = useLanguage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => buildUnitOptions(food, lang, t), [food, lang])
  const [start] = useState(() => startAmount(food, options))
  const [unitIdx, setUnitIdx] = useState(start[0])
  const [qty, setQty] = useState(start[1])
  const option = options[unitIdx] || options[0]
  const q = parseNum(qty)
  const valid = Number.isFinite(q) && q > 0 && round1(q * option.g) > 0
  const grams = valid ? round1(q * option.g) : 0
  const macros = scaleMacros(food, grams)

  function setUnit(i) {
    setUnitIdx(i)
    setQty(String(options[i].def))
  }
  function step(dir) {
    const cur = Number.isFinite(q) ? q : 0
    setQty(String(Math.max(0, round2(cur + dir * option.step))))
  }
  function mult(m) {
    if (m === 1) setQty(String(option.def))
    else setQty(String(round2((Number.isFinite(q) ? q : 0) * m)))
  }
  return { options, unitIdx, option, qty, setQty, valid, q, grams, macros, setUnit, step, mult }
}
