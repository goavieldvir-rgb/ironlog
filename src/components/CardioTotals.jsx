import React from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { cardioSummary, cardioTotalParts } from '../lib/cardio.js'

// Time, distance, pace and speed for one cardio exercise. Each piece is
// isolated left-to-right so Hebrew labels don't shuffle the numbers.
export default function CardioTotals({ sets, unit, minLabel }) {
  const { t } = useLanguage()
  const labels = {
    km: t('sessionCard.kmUnit'),
    mi: t('sessionCard.miUnit'),
    kmh: t('sessionCard.kmhUnit'),
    mph: t('sessionCard.mphUnit'),
    paceKm: t('sessionCard.paceKm'),
    paceMi: t('sessionCard.paceMi'),
  }
  const parts = cardioTotalParts(cardioSummary(sets), unit, minLabel, labels)
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
