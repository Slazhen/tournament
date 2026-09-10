import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import Pitch from '../components/Pitch'
import { IconMail, IconCalendar, IconChart, IconLink } from '../components/icons'
import { useSignedIn } from '../contexts/AuthContext'

/** The one address to write to. Printed as well as linked: a mailto: does
 *  nothing on a machine with no mail client set up, and the address is what the
 *  visitor actually needs. */
const CONTACT_EMAIL = 'mft@slazhen.com'

/**
 * Where "Start a new Tournament" leads.
 *
 * There is no self-serve sign-up here and there is not going to be one soon:
 * an organiser's account is opened by hand. The button used to point at
 * /login, which is a door with nothing behind it for somebody who has never
 * been here — no way in, and nothing on the screen saying how to get one. So it
 * points here instead: what the product does, what opening a competition
 * involves, and the address to write to.
 */
export default function StartPage() {
  const signedIn = useSignedIn()

  return (
    <div className="min-h-screen bg-[#0B1120] text-white relative overflow-hidden">
      <Pitch />

      {/* Signed in, the admin bar is already above this page with the same logo
          in it, and a Sign in button beside it offers a door already come
          through. */}
      {!signedIn && (
        <header className="relative z-10">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Link to="/">
              <Logo size={30} />
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </header>
      )}

      <section className="relative z-10 container mx-auto px-4 pt-12 pb-20 sm:pt-20 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
          Start a new tournament
        </h1>

        <p className="mt-6 text-lg text-gray-300 leading-relaxed">
          MFTournament runs league seasons, cups, groups and finals for local football and futsal.
          Pick the clubs and a format and it writes the fixture list; enter the scores and the
          table, the goal difference and the scorers look after themselves, on a public page you
          can send to every player, parent and club in one link.
        </p>

        <div className="mt-10 rounded-2xl bg-gradient-to-br from-blue-600/15 to-purple-600/15 border border-white/10 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Interested in using it?</h2>
          <p className="mt-3 text-gray-300 leading-relaxed">
            Accounts are opened by hand at the moment, so there is no sign-up form to fill in.
            Write to us and we will set your competition up and send you the way in.
          </p>

          <a
            href={`mailto:${CONTACT_EMAIL}?subject=MFTournament`}
            className="mt-6 inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors"
          >
            <IconMail size={18} />
            {CONTACT_EMAIL}
          </a>

          <p className="mt-6 text-sm text-gray-400 leading-relaxed">
            It helps if you say what the competition is called, how many clubs are in it, how it is
            played — a league, home and away, groups, a cup — and roughly when it starts.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          <Point icon={IconCalendar} title="Fixtures, generated">
            Give it a start date and a weekly slot and the whole calendar fills in.
          </Point>
          <Point icon={IconChart} title="A table that keeps itself">
            Type in a score and the standings re-sort themselves.
          </Point>
          <Point icon={IconLink} title="One link to share">
            Nobody you send the public page to has to sign in.
          </Point>
        </div>

        <p className="mt-12 text-sm text-gray-400">
          Already running a competition here?{' '}
          <Link to="/login" className="text-blue-300 hover:text-blue-200 transition-colors">
            Sign in
          </Link>
          . Or{' '}
          {/* A plain anchor rather than a Link: the target is a fragment on
              another route, and the router restores no scroll position for one. */}
          <a href="/#leagues" className="text-blue-300 hover:text-blue-200 transition-colors">
            see the leagues already on MFTournament
          </a>
          .
        </p>
      </section>

      <footer className="relative z-10 border-t border-white/5">
        <div className="container mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <Logo size={24} />
          <p>Football league and tournament management. Sydney, Australia.</p>
        </div>
      </footer>
    </div>
  )
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ size?: number }>
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
      <div className="w-9 h-9 mb-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-200">
        <Icon size={18} />
      </div>
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-gray-300 leading-relaxed">{children}</p>
    </div>
  )
}
