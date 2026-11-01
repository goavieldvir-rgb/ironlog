import { useMemo, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { buildUnitOptions, parseNum, round1, scaleMacros, startAmount } from '../../lib/nutrition.js'

const round2 = (n) => Math.round(n * 100) / 100

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
