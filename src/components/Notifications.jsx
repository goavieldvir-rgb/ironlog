import React, { useEffect, useState } from 'react'
import { Bell, Share, SquarePlus, Smartphone, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFeedback } from '../context/FeedbackContext.jsx'
import { Card, Button } from './ui.jsx'
import { DEFAULT_REMIND_TIME, pushStatus, getMyReminder, enableReminder, updateReminder, disableReminder, sendTestNotification, isIOS } from '../lib/push.js'

export default function Notifications() {
  const { user } = useAuth()
  const { t, lang } = useLanguage()
  const { toast } = useFeedback()
  const status = pushStatus()
  const [on, setOn] = useState(false)
  const [time, setTime] = useState(DEFAULT_REMIND_TIME)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(status !== 'ready')

  useEffect(() => {
    if (status !== 'ready') return
    getMyReminder(user.uid)
      .then((r) => {
        if (r) { setOn(true); setTime(String(r.remind_time).slice(0, 5)) }
      })
      .catch(console.error)
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (on) {
        await disableReminder(user.uid)
        setOn(false)
        toast(t('notifications.turnedOff'))
      } else {
        await enableReminder(user.uid, time, lang)
        setOn(true)
        toast(t('notifications.turnedOn'))
      }
    } catch (e) {
      console.error(e)
      toast(e.message === 'denied' ? t('notifications.denied') : t('notifications.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    try {
      const r = await sendTestNotification()
      toast(t(r === 'sent' ? 'notifications.testSent' : r === 'too-soon' ? 'notifications.testWait' : 'notifications.failed'), r === 'sent' ? undefined : 'error')
    } finally {
      setBusy(false)
    }
  }

  async function changeTime(v) {
    setTime(v)
    if (!on || !v) return
    try {
      await updateReminder(user.uid, v, lang)
      toast(t('notifications.timeSaved'))
    } catch (e) {
      console.error(e)
      toast(t('notifications.failed'), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1 flex items-center gap-1.5"><Bell size={13} /> {t('notifications.eyebrow')}</div>
        <h1 className="text-3xl">{t('notifications.title')}</h1>
        <p className="text-chalkdim text-sm mt-1">{t('notifications.subtitle')}</p>
      </div>

      {status === 'needs-install' && (
        <Card>
          <div className="flex items-center gap-2 font-medium mb-1"><Smartphone size={18} /> {t('notifications.installTitle')}</div>
          <p className="text-chalkdim text-sm mb-3">{t('notifications.installBody')}</p>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="num w-6 h-6 shrink-0 rounded-full bg-surface2 flex items-center justify-center text-xs">1</span>
              <span className="flex-1">{t('notifications.step1')} <Share size={15} className="inline align-text-bottom" /></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="num w-6 h-6 shrink-0 rounded-full bg-surface2 flex items-center justify-center text-xs">2</span>
              <span className="flex-1">{t('notifications.step2')} <SquarePlus size={15} className="inline align-text-bottom" /></span>
            </li>
          </ol>
          <p className="text-chalkdim text-xs mt-3">{t('notifications.installAfter')}</p>
        </Card>
      )}

      {status === 'unsupported' && (
        <Card><p className="text-sm text-chalkdim">{isIOS() ? t('notifications.unsupportedIos') : t('notifications.unsupported')}</p></Card>
      )}

      {status === 'denied' && (
        <Card><p className="text-sm text-chalkdim">{t('notifications.blocked')}</p></Card>
      )}

      {status === 'ready' && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{t('notifications.toggleLabel')}</div>
              <div className="text-chalkdim text-sm">{t('notifications.toggleHint')}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={t('notifications.toggleLabel')}
              disabled={busy || !loaded}
              onClick={toggle}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ironbtn' : 'bg-surface2'}`}
            >
              <span className={`absolute top-0.5 start-0.5 w-6 h-6 rounded-full bg-chalk transition-transform ${on ? 'ltr:translate-x-5 rtl:-translate-x-5' : ''}`} />
            </button>
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span>
              <span className="block font-medium">{t('notifications.timeLabel')}</span>
              <span className="block text-chalkdim text-sm">{t('notifications.timeHint')}</span>
            </span>
            <input
              type="time"
              dir="ltr"
              value={time}
              onChange={(e) => changeTime(e.target.value)}
              className="num bg-surface2 rounded-md px-3 min-h-[44px] text-chalk"
            />
          </label>
          {on && (
            <div className="border-t border-line pt-4">
              <Button variant="ghost" onClick={sendTest} disabled={busy}>
                <Send size={16} /> {t('notifications.testButton')}
              </Button>
            </div>
          )}
        </Card>
      )}

      <p className="text-chalkdim text-xs">{t('notifications.timerNote')}</p>
    </div>
  )
}
