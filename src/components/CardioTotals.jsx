import React from 'react'
import { cardioSummary, cardioTotalParts } from '../lib/cardio.js'

// Time, distance, pace and speed for one cardio exercise. Each piece is
// isolated left-to-right so Hebrew labels don't shuffle the numbers.
export default function CardioTotals({ sets, unit, minLabel }) {
  const parts = cardioTotalParts(cardioSummary(sets), unit, minLabel)
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' · '}
          <bdi dir="ltr">{p}</bdi>
        </React.Fragment>
      ))}
    </>
  )
}
