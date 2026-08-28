import { Link } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../contexts/AuthContext'
import { IconArrowLeft, IconShield } from './icons'

/**
 * The way back.
 *
 * Public pages had no navigation at all: someone who followed a link to a
 * tournament could read it, and then had nowhere to go — no way to the other
 * leagues on the site, no way to the front page, nothing to say what this site
 * even was. The logo goes home; anything else here would compete with the page.
 */
export default function PublicHeader({ back }: { back?: { to: string; label: string } }) {
  // A manager who followed a table out of their own club's page had no way
  // back into it: these pages carry no admin bar, so the only route was the
  // browser's back button or typing the address.
  const { user } = useAuth()
  const runsAClub = (user?.teamIds?.length ?? 0) > 0

  return (
    <header className="relative z-20">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="shrink-0 hover:opacity-80 transition-opacity">
          <Logo size={26} />
        </Link>

        <div className="flex items-center gap-4">
        {runsAClub && (
          <Link
            to="/my-club"
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
          >
            <IconShield size={14} /> My club
          </Link>
        )}

        {back ? (
          <Link
            to={back.to}
            className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <IconArrowLeft size={15} /> {back.label}
          </Link>
        ) : (
          <Link
            to="/#leagues"
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            All leagues
          </Link>
        )}
        </div>
      </div>
    </header>
  )
}
