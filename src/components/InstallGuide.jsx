import React, { useState } from 'react'
import { ChevronDown, Download, EllipsisVertical, Ellipsis, Share, Smartphone, SquarePlus } from 'lucide-react'
import { Card } from './ui.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { isIos, standalone, useInstallPrompt } from '../lib/install.js'

// Step-by-step "add to Home Screen" guide for iPhone (Safari) and Android
// (Chrome). Always on the Help page, so it can be found again after the
// one-tap install card was dismissed, or to walk someone else through it.
// Opens on the tab for the phone in hand; starts collapsed once installed.
const STEPS = {
  ios: [
    { key: 'ios1', icon: Share, alt: Ellipsis },
    { key: 'ios2', icon: SquarePlus },
    { key: 'ios3' },
    { key: 'ios4' },
  ],
  android: [
    { key: 'android1', icon: EllipsisVertical },
    { key: 'android2', icon: Download },
    { key: 'android3' },
    { key: 'android4' },
  ],
}

function defaultPlatform() {
  if (isIos()) return 'ios'
  if (/Android/i.test(navigator.userAgent)) return 'android'
  return 'ios'
}

export default function InstallGuide() {
  const { t } = useLanguage()
  const installed = standalone()
  const [open, setOpen] = useState(!installed)
  const [platform, setPlatform] = useState(defaultPlatform)
  const install = useInstallPrompt()

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        id="install-guide-h"
        aria-expanded={open}
        aria-controls="install-guide-p"
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-surface2"
      >
        <span className="flex items-center gap-2 text-chalk">
          <Smartphone size={18} className="shrink-0 text-irontext" /> {t('installGuide.title')}
        </span>
        <ChevronDown size={16} className={`text-chalkdim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div id="install-guide-p" role="region" aria-labelledby="install-guide-h" className="px-4 pb-4 pt-3 border-t border-line flex flex-col gap-4">
          <p className="text-chalkdim text-sm">{installed ? t('installGuide.installed') : t('installGuide.intro')}</p>

          <div role="tablist" aria-label={t('installGuide.choose')} className="flex gap-1 bg-surface2 rounded-[12px] p-1 w-fit">
            {['ios', 'android'].map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                id={`install-tab-${p}`}
                aria-selected={p === platform}
                aria-controls="install-steps"
                onClick={() => setPlatform(p)}
                className={`px-4 min-h-10 rounded-[9px] text-sm ${p === platform ? 'bg-surface text-chalk' : 'text-chalkdim'}`}
              >
                {t(`installGuide.${p}`)}
              </button>
            ))}
          </div>

          <div id="install-steps" role="tabpanel" aria-labelledby={`install-tab-${platform}`} className="flex flex-col gap-3">
            <p className="text-chalkdim text-xs">{t(`installGuide.${platform}Browser`)}</p>
            <ol className="flex flex-col gap-3 text-sm">
              {STEPS[platform].map(({ key, icon: Icon, alt: Alt }, i) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="num w-6 h-6 shrink-0 rounded-full bg-surface2 flex items-center justify-center text-xs">{i + 1}</span>
                  <span className="flex-1 leading-relaxed">
                    {t(`installGuide.${key}`)}
                    {Icon && <Icon size={15} aria-hidden="true" className="inline align-text-bottom ms-1.5 text-irontext" />}
                    {Alt && <span className="block text-chalkdim text-xs mt-1">{t(`installGuide.${key}Alt`)} <Alt size={14} aria-hidden="true" className="inline align-text-bottom" /></span>}
                  </span>
                </li>
              ))}
            </ol>
            {platform === 'android' && install && (
              <button type="button" onClick={install} className="press rounded-full bg-accent text-ink font-semibold px-4 min-h-11 text-sm w-fit">
                {t('installGuide.oneTap')}
              </button>
            )}
          </div>

          <p className="text-chalkdim text-xs leading-relaxed border-t border-line pt-3">{t('installGuide.after')}</p>
        </div>
      )}
    </Card>
  )
}
