import React, { Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { PageLoader } from './Loading.jsx'
import { Dumbbell, LayoutDashboard, ListChecks, History, Library, LogOut, X, Users, UserCheck, BarChart3, Scale, FileText, HelpCircle, CircleUser, Bell, Apple, Home, Ellipsis } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useScrollLock, resetLockedScroll } from '../lib/scrollLock.js'

const links = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/routines', labelKey: 'nav.routines', icon: ListChecks },
  { to: '/exercises', labelKey: 'nav.exercises', icon: Library },
  { to: '/history', labelKey: 'nav.history', icon: History },
  { to: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
  { to: '/weight', labelKey: 'nav.weight', icon: Scale },
  { to: '/summary', labelKey: 'nav.summary', icon: FileText },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { isAdmin, nutritionAllowed, actingAs, setActingAs } = useAdmin()
  const { t, lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  useScrollLock(open)
  const location = useLocation()
  const navType = useNavigationType()
  const inWorkout = location.pathname.startsWith('/workout/')

  // Any navigation closes the menu (including the browser's back button),
  // and a newly opened page starts at its top. Nothing did this before, so
  // a page opened from halfway down another one showed up halfway down
  // too. Going back (POP) is left to the browser, which returns you to
  // where you were.
  useEffect(() => {
    if (navType !== 'POP') {
      resetLockedScroll()
      window.scrollTo(0, 0)
    }
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const navLinks = [
    ...links,
    ...(isAdmin ? [{ to: '/people', labelKey: 'nav.people', icon: Users }] : []),
    ...(nutritionAllowed ? [{ to: '/nutrition', labelKey: 'nav.nutrition', icon: Apple }] : []),
  ]

  // The four destinations used every day, plus More for everything else.
  // Nutrition takes the second slot only for people whose coach turned it on.
  const tabs = [
    { to: '/', labelKey: 'nav.today', icon: Home, end: true },
    nutritionAllowed
      ? { to: '/nutrition', labelKey: 'nav.nutritionTab', icon: Apple }
      : { to: '/routines', labelKey: 'nav.routines', icon: ListChecks },
    { to: '/history', labelKey: 'nav.history', icon: History },
    { to: '/stats', labelKey: 'nav.progress', icon: BarChart3 },
  ]
  const tabPaths = new Set(tabs.map((tab) => tab.to))
  const showTabs = !inWorkout

  function toggleLang() {
    setLang(lang === 'en' ? 'he' : 'en')
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* On phones the brand bar is gone: navigation lives in the floating
          tab bar at the bottom, and each screen carries its own title. */}
      {actingAs && (
        <div className="md:hidden sticky top-0 z-20 bg-surface text-chalk text-sm" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="px-4 py-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <UserCheck size={15} className="shrink-0 text-chalkdim" />
              <span className="truncate">
                {t('layout.managingAccount')} <strong>{actingAs.name}</strong>
                {t('layout.accountSuffix')}
              </span>
            </span>
            <button onClick={() => setActingAs(null)} className="press shrink-0 rounded-full bg-accent text-ink font-semibold px-3 min-h-11 text-xs">
              {t('layout.backToMyAccount')}
            </button>
          </div>
        </div>
      )}
      <header
        className="hidden md:block border-b border-line sticky top-0 z-20 bg-ink/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* The logo goes home, except mid-workout, where a stray tap
              shouldn't pull you out of the session. */}
          {inWorkout ? (
            <div className="flex items-center gap-2">
              <Dumbbell className="text-irontext" size={22} strokeWidth={2.5} />
              <span className="font-display text-2xl tracking-wide">Ironlog</span>
            </div>
          ) : (
            <NavLink to="/" className="flex items-center gap-2" aria-label={t('nav.dashboard')}>
              <Dumbbell className="text-irontext" size={22} strokeWidth={2.5} />
              <span className="font-display text-2xl tracking-wide">Ironlog</span>
            </NavLink>
          )}

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim hover:text-chalk'
                  }`
                }
              >
                <l.icon size={16} />
                {t(l.labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="hit flex rounded-md bg-surface2 p-0.5 text-xs num"
              title={t('layout.language')} aria-label={t('layout.language')}
            >
              <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
              <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
            </button>
            <NavLink
              to="/notifications"
              className="text-chalkdim hover:text-brass transition-colors p-2 rounded-md hover:bg-surface2"
              title={t('nav.notifications')} aria-label={t('nav.notifications')}
            >
              <Bell size={18} />
            </NavLink>
            <NavLink
              to="/help"
              className="text-chalkdim hover:text-brass transition-colors p-2 rounded-md hover:bg-surface2"
              title={t('layout.howItWorks')} aria-label={t('layout.howItWorks')}
            >
              <HelpCircle size={18} />
            </NavLink>
            <NavLink to="/account" className="text-chalkdim text-sm hover:text-brass transition-colors" title={t('nav.account')}>
              {user?.displayName || user?.email}
            </NavLink>
            <button
              onClick={logout}
              className="text-chalkdim hover:text-irontext transition-colors p-2 rounded-md hover:bg-surface2"
              title={t('nav.logout')} aria-label={t('nav.logout')}
            >
              <LogOut size={18} />
            </button>
          </div>

        </div>

        {/* Lives inside the sticky header (not above it) so it sits below
            the phone's status bar and stays on screen while scrolling —
            "back to my account" must always be one tap away. */}
        {actingAs && (
          <div className="bg-surface text-chalk text-sm border-t border-line">
            <div className="max-w-5xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <UserCheck size={15} className="shrink-0" />
                <span className="truncate">
                  {t('layout.managingAccount')} <strong>{actingAs.name}</strong>
                  {t('layout.accountSuffix')}
                </span>
              </span>
              <button
                onClick={() => setActingAs(null)}
                className="shrink-0 rounded-md bg-brass text-ink font-medium px-3 min-h-11 text-xs hover:bg-brass/90"
              >
                {t('layout.backToMyAccount')}
              </button>
            </div>
          </div>
        )}

      </header>


      {/* The phone menu is its own full-screen layer, rendered outside the
          header. It used to unfold inside the sticky header, so opening it
          while scrolled down made the page taller, the scroll lock then
          pinned the page at the wrong height, and the menu ended up stuck
          half off screen with nothing responding. Now it covers the screen
          with its own top bar and scrolls on its own, wherever the page
          was scrolled to. */}
      {open &&
        createPortal(
          <div className="md:hidden fixed inset-0 z-40 bg-ink flex flex-col" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
            <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h1 className="text-[30px] leading-9">{t('nav.more')}</h1>
                <button className="press w-11 h-11 rounded-full bg-surface flex items-center justify-center" aria-label={t('common.close')} onClick={() => setOpen(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              {navLinks.filter((l) => !tabPaths.has(l.to)).map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 min-h-[52px] rounded-[14px] text-[15px] whitespace-nowrap ${
                      isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                    }`
                  }
                >
                  <l.icon size={18} />
                  {t(l.labelKey)}
                </NavLink>
              ))}
              <NavLink
                to="/notifications"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 min-h-[52px] rounded-[14px] text-[15px] whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <Bell size={16} /> {t('nav.notifications')}
              </NavLink>
              <NavLink
                to="/account"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 min-h-[52px] rounded-[14px] text-[15px] whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <CircleUser size={16} /> {t('nav.account')}
              </NavLink>
              <NavLink
                to="/help"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 min-h-[52px] rounded-[14px] text-[15px] whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <HelpCircle size={16} /> {t('nav.help')}
              </NavLink>
              <button
                onClick={toggleLang}
                className="flex items-center justify-between gap-2 px-3 min-h-[52px] rounded-[14px] text-[15px] text-chalkdim whitespace-nowrap"
              >
                <span>{t('layout.language')}</span>
                <span className="flex rounded-md bg-surface2 p-0.5 text-xs num">
                  <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
                  <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
                </span>
              </button>
              <button onClick={logout} className="flex items-center gap-3 px-3 min-h-[52px] rounded-[14px] text-[15px] text-irontext whitespace-nowrap">
                <LogOut size={16} /> {t('nav.logout')}
              </button>
            </nav>
          </div>,
          document.body,
        )}

      <main
        className={`flex-1 max-w-5xl mx-auto w-full px-5 md:px-4 pt-6 ${showTabs ? 'pb-[calc(env(safe-area-inset-bottom,0px)+7.5rem)]' : 'pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]'} md:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
      >
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      {showTabs && (
        <>
          {/* Fades the content out under the bar so text never sits
              half-legible behind the blur. */}
          <div aria-hidden="true" className="md:hidden fixed inset-x-0 bottom-0 z-20 h-32 pointer-events-none bg-gradient-to-b from-ink/0 to-ink/90" />
          <nav
            aria-label={t('nav.tabs')}
            className="md:hidden fixed inset-x-4 z-30 h-16 p-1.5 rounded-[24px] grid grid-cols-5 gap-1 bg-[#242428]/75 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.14),0_12px_32px_rgba(0,0,0,0.5)]"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `press flex flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11px] font-medium transition-colors duration-150 ${
                    isActive ? 'bg-white/[0.08] text-chalk' : 'text-[#8A8A90]'
                  }`
                }
              >
                <tab.icon size={22} strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate max-w-full px-1">{t(tab.labelKey)}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className="press flex flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11px] font-medium text-[#8A8A90]"
            >
              <Ellipsis size={22} strokeWidth={1.75} aria-hidden="true" />
              <span>{t('nav.more')}</span>
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
