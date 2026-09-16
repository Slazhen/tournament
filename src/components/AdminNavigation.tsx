import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import Logo from './Logo'
import { useAuth } from '../contexts/AuthContext'
import { clubService } from '../lib/data'
import type { ManagedClub } from '../lib/data'
import { MY_TEAMS_CHANGED } from '../utils/myTeams'
import { cdnUrl } from '../utils/images'
import { IconArrowDown, IconShield } from './icons'

const ORGANIZER_NAV_ITEMS = [
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/teams', label: 'Teams' },
  { to: '/calendar', label: 'Calendar' },
]

// The super admin's own sections. They used to sit in the account menu behind
// the avatar, where nobody looked for them: the audit log was reachable only by
// typing /changes. They are pages, not account actions, so they belong beside
// the other tabs.
const SUPER_ADMIN_NAV_ITEMS = [
  { to: '/organizers', label: 'Organizers' },
  { to: '/changes', label: 'Changes' },
]

// The clubs this account runs itself, as against "Teams", which is every club
// in the organiser's competitions. An organiser who also coaches a side has
// both, and they are different questions: one is a list to run a league from,
// the other is the club they answer for.
const MY_TEAMS_PATH = '/my-club'

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
  const { isSuperAdmin, isTeamManager, user, logout } = useAuth()
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

  // What this account may do, which is two questions rather than one. An
  // organiser who also runs a club had no way to reach it: /my-club existed but
  // nothing in the bar pointed at it, so the only way in was typing the
  // address. A club manager had no bar at all — not even a way to sign out.
  const canOrganize = Boolean(currentOrganizer) || isSuperAdmin
  // The role, not only the list: an account's teamIds and the managerUserIds on
  // the clubs are written one after the other and can disagree, and a manager
  // whose list came back empty was left with a bar that offered them nothing.
  const runsAClub = isTeamManager || (user?.teamIds?.length ?? 0) > 0

  const [clubs, setClubs] = useState<ManagedClub[]>([])
  const [clubsOpen, setClubsOpen] = useState(false)
  const clubsRef = useRef<HTMLDivElement>(null)
  // Reloaded when the account's list moves (joining or leaving a club
  // refreshes the session) and when a page announces a change the session
  // does not carry, such as who is head.
  const clubsKey = runsAClub ? `${user?.id}:${(user?.teamIds ?? []).join(',')}` : ''

  useEffect(() => {
    if (!clubsKey) {
      setClubs([])
      return
    }
    let cancelled = false
    const load = () => {
      clubService
        .myTeams()
        .then((list) => {
          if (!cancelled) setClubs(list)
        })
        // The bar still works without the names: "My teams" falls back to the
        // list page, which loads them itself.
        .catch(() => undefined)
    }
    load()
    window.addEventListener(MY_TEAMS_CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(MY_TEAMS_CHANGED, load)
    }
  }, [clubsKey])

  useEffect(() => {
    if (!clubsOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!clubsRef.current?.contains(event.target as Node)) setClubsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setClubsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [clubsOpen])

  useEffect(() => setClubsOpen(false), [location.pathname])

  // Anybody signed in gets the bar, even with no tabs in it: it carries the
  // account menu, and the way out. Without this an organiser between organisers
  // — or a manager whose club has just gone — was left on a page with no
  // navigation at all, and the landing page answered by offering them Sign in.
  if (!user && !currentOrganizer) return null

  const navItems = [
    ...(canOrganize ? ORGANIZER_NAV_ITEMS : []),
    ...(isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : []),
  ]

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const linkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm transition-colors ${
      active
        ? 'bg-white/10 text-white font-medium'
        : 'text-white/60 hover:text-white hover:bg-white/5'
    }`

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
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={linkClass(isActive(item.to))}>
              {item.label}
            </Link>
          ))}

          {/* One club goes straight to it; several open a list, because the
              point of the item is to reach one club in one click. */}
          {runsAClub &&
            (clubs.length <= 1 ? (
              <Link
                to={clubs.length === 1 ? `${MY_TEAMS_PATH}/${clubs[0].id}` : MY_TEAMS_PATH}
                className={linkClass(isActive(MY_TEAMS_PATH))}
              >
                My teams
              </Link>
            ) : (
              <div className="relative" ref={clubsRef}>
                <button
                  type="button"
                  onClick={() => setClubsOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={clubsOpen}
                  className={`${linkClass(isActive(MY_TEAMS_PATH))} inline-flex items-center gap-1`}
                >
                  My teams <IconArrowDown size={12} />
                </button>
                {clubsOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[rgb(var(--bg))] shadow-2xl overflow-hidden"
                  >
                    <div className="py-1 max-h-[60vh] overflow-y-auto">
                      {clubs.map((club) => {
                        const to = `${MY_TEAMS_PATH}/${club.id}`
                        return (
                          <Link
                            key={club.id}
                            to={to}
                            role="menuitem"
                            className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                              isActive(to) ? 'bg-white/10' : 'hover:bg-white/5'
                            }`}
                          >
                            {club.logo ? (
                              <img
                                src={cdnUrl(club.logo)}
                                alt=""
                                className="w-6 h-6 rounded object-cover shrink-0"
                              />
                            ) : (
                              <span className="w-6 h-6 rounded shrink-0 flex items-center justify-center bg-white/10">
                                <IconShield size={13} />
                              </span>
                            )}
                            <span className="truncate flex-1">{club.name}</span>
                            {club.isHead && (
                              <span className="text-[10px] uppercase tracking-wide opacity-50">
                                Head
                              </span>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                    <div className="border-t border-white/10 py-1">
                      <Link
                        to={MY_TEAMS_PATH}
                        role="menuitem"
                        className="block px-4 py-2 text-sm hover:bg-white/5 transition-colors"
                      >
                        All my teams
                      </Link>
                    </div>
                  </div>
                )}
              </div>
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
                <MenuItem onClick={() => navigate('/')}>Public site</MenuItem>
              </div>

              <div className="py-1 border-t border-white/10 text-sm">
                <MenuItem
                  onClick={async () => {
                    await logout()
                    navigate('/login')
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
