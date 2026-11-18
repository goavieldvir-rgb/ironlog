import React from 'react'
import { CloudOff, CloudUpload } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { logSession } from '../lib/db.js'
import { useOutbox } from '../lib/outbox.js'

// The quiet line at the top of the screen when the phone is offline, or
// while finished workouts are waiting on this phone for a connection. It
// also does the sending, so it's mounted once, in Layout, for as long as
// someone is signed in.
export default function PendingSync({ online }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const { toast } = useFeedback()
  const onSynced = (n) => toast(n === 1 ? t('sync.doneOne') : t('sync.doneMany', { n }))
  const { count, syncing, syncNow } = useOutbox(user?.uid, logSession, onSynced)

  if (!count && online) return null
  const bar = 'sticky top-0 z-30 bg-surface text-chalkdim text-xs px-4 py-2 border-b border-line'
  const pad = { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }
  if (!count) return <div className={`${bar} text-center`} style={pad}>{t('layout.offline')}</div>
  const Icon = online ? CloudUpload : CloudOff
  const label = online
    ? count === 1 ? t('sync.waitingOne') : t('sync.waitingMany', { n: count })
    : count === 1 ? t('sync.offlineOne') : t('sync.offlineMany', { n: count })
  return (
    <div className={`${bar} flex items-center justify-center gap-2`} style={pad}>
      <Icon size={14} strokeWidth={2.25} className={`shrink-0 ${syncing ? 'animate-pulse motion-reduce:animate-none' : ''}`} aria-hidden="true" />
      <span>{syncing ? t('sync.syncing') : label}</span>
      {online && !syncing && (
        <button type="button" onClick={syncNow} className="text-accent font-semibold min-h-[28px] px-1">
          {t('sync.retry')}
        </button>
      )}
    </div>
  )
}
