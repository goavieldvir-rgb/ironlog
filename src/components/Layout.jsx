import React, { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, ListChecks, History, Library, LogOut, Menu, X, Users, UserCheck, BarChart3, Scale, FileText, HelpCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

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

  const navLinks = isAdmin ? [...links, { to: '/people', labelKey: 'nav.people', icon: Users }] : links

  function toggleLang() {
    setLang(lang === 'en' ? 'he' : 'en')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {actingAs && (
        <div className="bg-brasssoft text-brass text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap">
          <UserCheck size={15} />
          <span>
            {t('layout.managingAccount')} <strong>{actingAs.name}</strong>
            {t('layout.accountSuffix')}
          </span>
          <button onClick={() => setActingAs(null)} className="underline hover:no-underline ms-1">
            {t('layout.backToMyAccount')}
          </button>
        </div>
      )}

      <header className="border-b border-line sticky top-0 z-20 bg-ink/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="text-iron" size={22} strokeWidth={2.5} />
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
              className="flex rounded-md bg-surface2 p-0.5 text-xs num"
              title={t('layout.language')}
            >
              <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
              <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
            </button>
            <NavLink
              to="/help"
              className="text-chalkdim hover:text-brass transition-colors p-2 rounded-md hover:bg-surface2"
              title={t('layout.howItWorks')}
            >
              <HelpCircle size={18} />
            </NavLink>
            <span className="text-chalkdim text-sm">{user?.displayName || user?.email}</span>
            <button
              onClick={logout}
              className="text-chalkdim hover:text-iron transition-colors p-2 rounded-md hover:bg-surface2"
              title={t('nav.logout')}
            >
              <LogOut size={18} />
            </button>
          </div>

          <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {open && (
          <nav className="md:hidden border-t border-line px-4 py-2 flex flex-col gap-1">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-2.5 rounded-md text-sm whitespace-nowrap ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <l.icon size={16} />
                {t(l.labelKey)}
              </NavLink>
            ))}
            <NavLink
              to="/help"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-2.5 rounded-md text-sm whitespace-nowrap ${
                  isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                }`
              }
            >
              <HelpCircle size={16} /> {t('nav.help')}
            </NavLink>
            <button
              onClick={toggleLang}
              className="flex items-center justify-between gap-2 px-2 py-2.5 rounded-md text-sm text-chalkdim whitespace-nowrap"
            >
              <span>{t('layout.language')}</span>
              <span className="flex rounded-md bg-surface2 p-0.5 text-xs num">
                <span className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>EN</span>
                <span className={`px-2 py-1 rounded ${lang === 'he' ? 'bg-ink text-chalk' : 'text-chalkdim'}`}>עב</span>
              </span>
            </button>
            <button onClick={logout} className="flex items-center gap-2 px-2 py-2.5 rounded-md text-sm text-iron whitespace-nowrap">
              <LogOut size={16} /> {t('nav.logout')}
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
