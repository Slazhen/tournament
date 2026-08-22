import { Link } from 'react-router-dom'
import Logo from './Logo'
import { IconArrowLeft } from './icons'

/**
 * The way back.
 *
 * Public pages had no navigation at all: someone who followed a link to a
 * tournament could read it, and then had nowhere to go — no way to the other
 * leagues on the site, no way to the front page, nothing to say what this site
 * even was. The logo goes home; anything else here would compete with the page.
 */
export default function PublicHeader({ back }: { back?: { to: string; label: string } }) {
  return (
    <header className="relative z-20">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="shrink-0 hover:opacity-80 transition-opacity">
          <Logo size={26} />
        </Link>

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
    </header>
  )
}
