import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import Logo from './Logo'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/teams', label: 'Teams' },
  { to: '/calendar', label: 'Calendar' },
]

/**
 * The admin bar.
 *
 * It used to open with a boxed "Logged in as / Homebush Futsal" panel wide
 * enough to crowd the navigation — information the organiser already knows,
 * repeated on every page. Identity is now one avatar in the corner, and what
 * sits behind it (switching organiser, theme, signing out) opens on demand.
 */
export default function AdminNavigation() {
  const { getCurrentOrganizer, setCurrentOrganizer } = useAppStore()
  const { isSuperAdmin, user, logout } = useAuth()
  const currentOrganizer = getCurrentOrganizer()
  const location = useLocation()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape, the way a menu is expected to behave.
  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  // Close the menu when the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname])

  if (!currentOrganizer && !isSuperAdmin) return null

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const accountName = user?.displayName || (isSuperAdmin ? 'Super admin' : currentOrganizer?.name ?? 'Account')
  const initial = (user?.displayName || (isSuperAdmin ? 'S' : currentOrganizer?.name ?? '?'))
    .charAt(0)
    .toUpperCase()

  return (
    <header className="sticky top-0 z-50 glass-header">
      <div className="mx-auto container-max px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="shrink-0 hover:opacity-80 transition-opacity">
          <Logo size={26} />
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive(item.to)
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={accountName}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white transition-transform hover:scale-105 ${
              isSuperAdmin
                ? 'bg-gradient-to-br from-yellow-500 to-orange-600'
                : 'bg-gradient-to-br from-blue-500 to-purple-600'
            }`}
          >
            {initial}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-60 rounded-xl border border-white/10 bg-[rgb(var(--bg))] shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-white/10">
                <div className="font-medium truncate">{accountName}</div>
                {user?.email && <div className="text-xs opacity-60 truncate">{user.email}</div>}
                {isSuperAdmin && (
                  <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-yellow-400">
                    Super admin
                  </span>
                )}
              </div>

              <div className="py-1 text-sm">
                {!isSuperAdmin && currentOrganizer && (
                  <MenuItem onClick={() => setCurrentOrganizer('')}>Switch organizer</MenuItem>
                )}
                {isSuperAdmin && (
                  <MenuItem onClick={() => navigate('/admin/organizers')}>Organizers</MenuItem>
                )}
                {isSuperAdmin && (
                  <MenuItem onClick={() => navigate('/admin/changes')}>Changes</MenuItem>
                )}
                <MenuItem onClick={() => navigate('/')}>Public site</MenuItem>
              </div>

              <div className="py-1 border-t border-white/10 text-sm">
                <MenuItem
                  onClick={async () => {
                    await logout()
                    navigate('/admin/login')
                  }}
                  tone="danger"
                >
                  Sign out
                </MenuItem>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MenuItem({
  children,
  onClick,
  tone = 'normal',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'normal' | 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-4 py-2 transition-colors ${
        tone === 'danger' ? 'text-red-300 hover:bg-red-500/10' : 'hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}
