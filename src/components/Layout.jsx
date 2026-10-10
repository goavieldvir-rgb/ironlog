import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, ListChecks, History, Library, LogOut, Menu, X, Users, UserCheck, BarChart3, Scale, FileText, HelpCircle, CircleUser, Bell } from 'lucide-react'
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
  const { isAdmin, actingAs, setActingAs } = useAdmin()
  const { t, lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  useScrollLock(open)
  const location = useLocation()
  const navType = useNavigationType()

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

  const navLinks = isAdmin ? [...links, { to: '/people', labelKey: 'nav.people', icon: Users }] : links

  function toggleLang() {
    setLang(lang === 'en' ? 'he' : 'en')
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="border-b border-line sticky top-0 z-20 bg-ink/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="text-irontext" size={22} strokeWidth={2.5} />
            <span className="font-display text-2xl tracking-wide">Ironlog</span>
          </div>

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

          <button className="md:hidden inline-flex items-center justify-center min-w-[44px] min-h-[44px] -me-2" aria-label={t('layout.menu')} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Lives inside the sticky header (not above it) so it sits below
            the phone's status bar and stays on screen while scrolling —
            "back to my account" must always be one tap away. */}
        {actingAs && (
          <div className="bg-brasssoft text-brass text-sm border-t border-line">
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
          <div className="md:hidden fixed inset-0 z-40 bg-ink flex flex-col" role="dialog" aria-modal="true" aria-label={t('layout.menu')}>
            <div className="border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dumbbell className="text-irontext" size={22} strokeWidth={2.5} />
                  <span className="font-display text-2xl tracking-wide">Ironlog</span>
                </div>
                <button className="p-2" aria-label={t('common.close')} onClick={() => setOpen(false)}>
                  <X size={22} />
                </button>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              {navLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-2 py-3 rounded-md whitespace-nowrap ${
                      isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                    }`
                  }
                >
                  <l.icon size={16} />
                  {t(l.labelKey)}
                </NavLink>
              ))}
              <NavLink
                to="/notifications"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-3 rounded-md whitespace-nowrap ${
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
                  `flex items-center gap-2 px-2 py-3 rounded-md whitespace-nowrap ${
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
                  `flex items-center gap-2 px-2 py-3 rounded-md whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <HelpCircle size={16} /> {t('nav.help')}
              </NavLink>
              <button
                onClick={toggleLang}
                className="flex items-center justify-between gap-2 px-2 min-h-11 rounded-md text-sm text-chalkdim whitespace-nowrap"
              >
                <span>{t('layout.language')}</span>
                <span className="flex rounded-md bg-surface2 p-0.5 text-xs num">
                  <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
                  <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
                </span>
              </button>
              <button onClick={logout} className="flex items-center gap-2 px-2 py-2.5 rounded-md text-sm text-irontext whitespace-nowrap">
                <LogOut size={16} /> {t('nav.logout')}
              </button>
            </nav>
          </div>,
          document.body,
        )}

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pt-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
        <Outlet />
      </main>
    </div>
  )
}
