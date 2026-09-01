import React, { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, ListChecks, History, Library, LogOut, Menu, X, Users, UserCheck, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdmin } from '../context/AdminContext.jsx'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/routines', label: 'Routines', icon: ListChecks },
  { to: '/exercises', label: 'Exercises', icon: Library },
  { to: '/history', label: 'History', icon: History },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { isAdmin, actingAs, setActingAs } = useAdmin()
  const [open, setOpen] = useState(false)

  const navLinks = isAdmin ? [...links, { to: '/people', label: 'People', icon: Users }] : links

  return (
    <div className="min-h-screen flex flex-col">
      {actingAs && (
        <div className="bg-brasssoft text-brass text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap">
          <UserCheck size={15} />
          <span>
            Managing <strong>{actingAs.name}</strong>'s account
          </span>
          <button onClick={() => setActingAs(null)} className="underline hover:no-underline ml-1">
            Back to my account
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
                  `flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim hover:text-chalk'
                  }`
                }
              >
                <l.icon size={16} />
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <span className="text-chalkdim text-sm">{user?.displayName || user?.email}</span>
            <button
              onClick={logout}
              className="text-chalkdim hover:text-iron transition-colors p-2 rounded-md hover:bg-surface2"
              title="Log out"
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
                  `flex items-center gap-2 px-2 py-2.5 rounded-md text-sm ${
                    isActive ? 'bg-surface2 text-chalk' : 'text-chalkdim'
                  }`
                }
              >
                <l.icon size={16} />
                {l.label}
              </NavLink>
            ))}
            <button onClick={logout} className="flex items-center gap-2 px-2 py-2.5 rounded-md text-sm text-iron">
              <LogOut size={16} /> Log out
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
