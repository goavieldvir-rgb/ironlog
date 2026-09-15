import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext.jsx'

// "Back" always points toward where you came from in reading order — left
// in English, right in Hebrew. "Forward" is the opposite. Using these
// instead of a raw ChevronLeft/ChevronRight keeps every back-link and
// list-disclosure arrow pointing the correct way under RTL.
export function BackChevron(props) {
  const { dir } = useLanguage()
  return dir === 'rtl' ? <ChevronRight {...props} /> : <ChevronLeft {...props} />
}

export function ForwardChevron(props) {
  const { dir } = useLanguage()
  return dir === 'rtl' ? <ChevronLeft {...props} /> : <ChevronRight {...props} />
}
