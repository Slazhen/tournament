import { useState, useEffect, useMemo } from 'react'
import type { ReactNode, ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import { organizerService, tournamentService } from '../lib/data'
import type { TournamentSummary } from '../lib/data'
import type { Organizer } from '../types'
import Logo from '../components/Logo'
import {
  IconCalendar,
  IconChart,
  IconLink,
  IconBall,
  IconStadium,
  IconLock,
} from '../components/icons'
import {
  currentSeason,
  getSeasonUrl,
  groupIntoSeries,
  seasonLabel,
} from '../utils/seasons'
import { useAuth, useSignedIn } from '../contexts/AuthContext'

/**
 * The front page.
 *
 * What was here before: a trophy emoji, a search box, an "Admin Access" button,
 * and — unless you typed something into the search — no content at all. A
 * visitor sent a link to the site could not tell what it did, and a search
 * engine had nothing to index but the word "MFTournament".
 *
 * So: say what the product does in the words someone looking for it would use,
 * show the thing itself rather than describing it, and list the leagues already
 * running here. Signing in is a button in the corner, because almost nobody
 * arriving on this page is an organiser.
 */
export default function HomePage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const { getCurrentOrganizer } = useAppStore()
  const currentOrganizer = getCurrentOrganizer()
  const signedIn = useSignedIn()
  const { user, isSuperAdmin, isTeamManager } = useAuth()

  // The page sells the product to a visitor, and every call to action sent them
  // to the sign-in screen. Signed in, that screen just bounces them back, so
  // the same buttons point at the thing they were being sold instead.
  const runsAClub = isTeamManager || (user?.teamIds?.length ?? 0) > 0
  const canOrganize = Boolean(currentOrganizer) || isSuperAdmin
  const callToAction = !signedIn
    ? { to: '/login', label: 'Start a tournament' }
    : canOrganize
      ? { to: '/tournaments/new', label: 'Create a tournament' }
      : runsAClub
        ? { to: '/my-club', label: 'Go to my club' }
        : { to: '/dashboard', label: 'Go to your account' }

  // A signed-in organiser wants their own tournaments, not the shop window.
  useEffect(() => {
    if (currentOrganizer) navigate('/dashboard')
  }, [currentOrganizer, navigate])

  useEffect(() => {
    let cancelled = false

    // getAllPublic, not getAll: getAll follows a signed-in user to
    // /admin/organizers, which answers with the organisers that user may
    // administer — one for an organiser, none at all for a club manager. This
    // page is the public directory and must show everybody the same thing,
    // whoever happens to be signed in. Using getAll here emptied the directory
    // for a signed-in club manager while the tournament count, read from a
    // genuinely public route, still said five.
    Promise.all([organizerService.getAllPublic(), tournamentService.getAllSummaries()])
      .then(([organizerList, tournamentList]) => {
        if (cancelled) return
        setOrganizers(organizerList)
        setTournaments(tournamentList)
      })
      .catch((error) => console.error('Error loading the public directory:', error))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Organisers with their public competitions underneath.
   *
   * One row per competition, not one per season. Seasons of a league share its
   * name, so a listing of seasons printed the same league twice with nothing on
   * screen to tell the two entries apart. The row opens the current season, and
   * the earlier ones are reached from the season switcher on that page.
   */
  const grouped = useMemo(
    () =>
      organizers
        .map((organizer) => ({
          organizer,
          competitions: groupIntoSeries(
            tournaments
              .filter((tournament) => tournament.organizerId === organizer.id)
              .filter((tournament) => tournament.visibility !== 'private'),
          )
            .map((series) => ({
              key: series.key,
              name: series.name,
              seasonCount: series.seasons.length,
              // groupIntoSeries never produces an empty group, so the fallback
              // is only here to keep the type honest.
              current: currentSeason(series.seasons) ?? series.seasons[0],
            }))
            .sort(
              (a, b) =>
                new Date(b.current.createdAtISO || 0).getTime() -
                new Date(a.current.createdAtISO || 0).getTime(),
            ),
        }))
        .filter((entry) => entry.competitions.length > 0),
    [organizers, tournaments],
  )

  /** The same list, narrowed by the search box. */
  const directory = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return grouped

    return grouped.filter(
      (entry) =>
        Boolean(entry.organizer.name?.toLowerCase().includes(needle)) ||
        entry.competitions.some((competition) => competition.name.toLowerCase().includes(needle)),
    )
  }, [grouped, query])

  // Counted from the list underneath rather than from the tournaments array, so
  // the sentence and the cards can never disagree. Counting the array directly
  // is what produced "five public tournaments from zero organisers": a
  // tournament whose organiser is missing from the list — because the viewer's
  // role hid it, or because the organiser record was deleted and the tournament
  // was not — is not shown, and must not be counted either.
  const publicTournamentCount = grouped.reduce(
    (total, entry) => total + entry.competitions.length,
    0,
  )

  return (
    <div className="min-h-screen bg-[#0B1120] text-white relative overflow-hidden">
      <Pitch />

      {/* ---------- Top bar ----------
          Only for a visitor. Signed in, the admin bar is already above this
          page with the same logo in it, and a Sign in button next to it was
          offering somebody a door they had already come through. */}
      {!signedIn && (
        <header className="relative z-10">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Logo size={30} />
            <Link
              to="/login"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </header>
      )}

      {/* ---------- Hero ---------- */}
      <section className="relative z-10 container mx-auto px-4 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Run your football league
              <span className="block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                without the spreadsheet
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-300 leading-relaxed max-w-xl">
              Pick your teams and a format, and MFTournament writes the fixture list. Enter the
              scores and the table, the goal difference and the scorers look after themselves — on
              a public page you can send to every player, parent and club in one link.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={callToAction.to}
                className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors"
              >
                {callToAction.label}
              </Link>
              <a
                href="#leagues"
                className="px-6 py-3 rounded-xl font-medium bg-white/5 hover:bg-white/10 border border-white/15 transition-colors"
              >
                See live leagues
              </a>
            </div>

            <p className="mt-6 text-sm text-gray-400">
              Free. Nothing to install — it opens in a browser, on a phone as well as a laptop.
            </p>
          </div>

          {/* The product, rather than a description of it. */}
          <TablePreview />
        </div>
      </section>

      {/* ---------- What it does ---------- */}
      <section className="relative z-10 container mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-3xl sm:text-4xl font-bold text-center">Everything a season needs</h2>
        <p className="mt-3 text-center text-gray-300 max-w-2xl mx-auto">
          Built for club leagues, futsal nights, corporate cups and school competitions.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={IconCalendar} title="Fixtures, generated">
            League, home and away, knockout cup, groups and playoffs, Swiss, or a finals format you
            build yourself. Give it a start date and a weekly slot and the whole calendar fills in.
          </Feature>
          <Feature icon={IconChart} title="A table that keeps itself">
            Type in a score and the standings re-sort: points, goal difference, goals for and
            against, played, won, drawn, lost.
          </Feature>
          <Feature icon={IconLink} title="One link to share">
            Every tournament gets a public page — fixtures, results, table, scorers — that reads
            properly on a phone. Nobody you send it to has to sign in.
          </Feature>
          <Feature icon={IconBall} title="Squads and scorers">
            Register players with numbers and photos, record goals, assists and clean sheets, and
            let anyone open a player's or a club's own page.
          </Feature>
          <Feature icon={IconStadium} title="Your club, your colours">
            Club crests, a tournament logo, the venue with a map link, and your Facebook and
            Instagram, all on the public page.
          </Feature>
          <Feature icon={IconLock} title="Private until you say so">
            Set a tournament up in private, get the draw right, and publish it when the season is
            ready to be seen.
          </Feature>
        </div>
      </section>

      {/* ---------- Directory ---------- */}
      <section
        id="leagues"
        className="relative z-10 container mx-auto px-4 py-16 border-t border-white/5 scroll-mt-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold">Leagues on MFTournament</h2>
            <p className="mt-2 text-gray-300">
              {loading
                ? 'Loading…'
                : `${publicTournamentCount} public ${
                    publicTournamentCount === 1 ? 'tournament' : 'tournaments'
                  } from ${directory.length} ${
                    directory.length === 1 ? 'organiser' : 'organisers'
                  }.`}
            </p>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a league or organiser"
            className="w-full sm:w-72 px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all placeholder-gray-500"
          />
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-40 rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : directory.length === 0 ? (
          <p className="text-gray-400 py-8">
            {query ? 'Nothing matches that search.' : 'No public tournaments yet.'}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {directory.map(({ organizer, competitions }) => (
              <article
                key={organizer.id}
                className="rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors p-5"
              >
                <div className="flex items-center gap-3 mb-4">
                  {organizer.logo ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={organizer.logo}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover border border-white/15"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/15 flex items-center justify-center font-semibold">
                      {organizer.name?.charAt(0).toUpperCase() || 'O'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{organizer.name}</h3>
                    <p className="text-xs text-gray-400">
                      {competitions.length}{' '}
                      {competitions.length === 1 ? 'tournament' : 'tournaments'}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1">
                  {competitions.map((competition) => (
                    <li key={competition.key}>
                      <Link
                        to={getSeasonUrl(competition.current, organizer)}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          {competition.current.logo ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={competition.current.logo}
                              alt=""
                              className="w-6 h-6 rounded object-contain"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-white/50">
                              <IconBall size={14} />
                            </span>
                          )}
                          <span className="truncate group-hover:text-blue-300 transition-colors">
                            {competition.name}
                          </span>
                          {/* Which season the link opens, said only where there
                              is more than one and the answer is not obvious. */}
                          {competition.seasonCount > 1 && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/5 text-[11px] text-gray-400">
                              {seasonLabel(competition.current)}
                            </span>
                          )}
                        </span>
                        {Boolean(competition.current.teamCount) && (
                          <span className="shrink-0 text-xs text-gray-400">
                            {competition.current.teamCount} teams
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Close ---------- */}
      <section className="relative z-10 container mx-auto px-4 py-16 border-t border-white/5">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600/15 to-purple-600/15 border border-white/10 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Your season, online tonight</h2>
          <p className="mt-3 text-gray-300 max-w-xl mx-auto">
            Add your clubs, choose how it will be played, and the fixture list is waiting for you on
            the other side.
          </p>
          <Link
            to={callToAction.to}
            className="mt-6 inline-block px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors"
          >
            {callToAction.label}
          </Link>
        </div>
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

/**
 * The background.
 *
 * A photograph would have been a megabyte of somebody else's stadium; these are
 * the markings of a pitch, drawn once and kept faint enough to stay behind the
 * text.
 */
function Pitch() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] rounded-full bg-purple-600/10 blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[28rem] h-[28rem] rounded-full bg-emerald-500/[0.06] blur-[120px]" />

      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="white"
        strokeWidth="2"
      >
        <rect x="60" y="40" width="1080" height="720" rx="4" />
        <line x1="600" y1="40" x2="600" y2="760" />
        <circle cx="600" cy="400" r="110" />
        <circle cx="600" cy="400" r="4" fill="white" stroke="none" />
        <rect x="60" y="220" width="160" height="360" />
        <rect x="60" y="320" width="60" height="160" />
        <rect x="980" y="220" width="160" height="360" />
        <rect x="1080" y="320" width="60" height="160" />
      </svg>
    </div>
  )
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ size?: number }>
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 hover:border-white/20 transition-colors">
      <div className="w-10 h-10 mb-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-200">
        <Icon size={20} />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-gray-300 leading-relaxed">{children}</p>
    </div>
  )
}

/** A standings table and a result, so the page shows what it makes. */
function TablePreview() {
  const rows = [
    { pos: 1, team: 'Riverside United', p: 12, w: 9, d: 2, l: 1, gd: '+21', pts: 29 },
    { pos: 2, team: 'Harbour City FC', p: 12, w: 8, d: 3, l: 1, gd: '+16', pts: 27 },
    { pos: 3, team: 'Northside Athletic', p: 12, w: 7, d: 1, l: 4, gd: '+8', pts: 22 },
    { pos: 4, team: 'Old Mill Rovers', p: 12, w: 4, d: 4, l: 4, gd: '−2', pts: 16 },
    { pos: 5, team: 'Parkview Wanderers', p: 12, w: 2, d: 2, l: 8, gd: '−19', pts: 8 },
  ]

  return (
    <div className="relative">
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-sm shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="font-semibold">Autumn League</div>
            <div className="text-xs text-gray-400">Round 12 of 14 · example</div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
            Public
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th className="text-left font-medium py-2 pl-5 pr-2">#</th>
                <th className="text-left font-medium py-2 px-2">Team</th>
                <th className="text-center font-medium py-2 px-2">P</th>
                <th className="text-center font-medium py-2 px-2 hidden sm:table-cell">W</th>
                <th className="text-center font-medium py-2 px-2 hidden sm:table-cell">D</th>
                <th className="text-center font-medium py-2 px-2 hidden sm:table-cell">L</th>
                <th className="text-center font-medium py-2 px-2">GD</th>
                <th className="text-center font-medium py-2 pr-5 pl-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.pos}
                  className={`border-b border-white/5 last:border-0 ${
                    row.pos <= 3 ? 'bg-gradient-to-r from-yellow-500/[0.06] to-transparent' : ''
                  }`}
                >
                  <td className="py-2.5 pl-5 pr-2">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                        row.pos === 1
                          ? 'bg-yellow-500 text-black'
                          : row.pos === 2
                            ? 'bg-gray-300 text-black'
                            : row.pos === 3
                              ? 'bg-orange-500 text-black'
                              : 'text-gray-400'
                      }`}
                    >
                      {row.pos}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 font-medium whitespace-nowrap">{row.team}</td>
                  <td className="py-2.5 px-2 text-center text-gray-300">{row.p}</td>
                  <td className="py-2.5 px-2 text-center text-gray-300 hidden sm:table-cell">
                    {row.w}
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-300 hidden sm:table-cell">
                    {row.d}
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-300 hidden sm:table-cell">
                    {row.l}
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-300">{row.gd}</td>
                  <td className="py-2.5 pr-5 pl-2 text-center font-bold">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* A finished match: the other half of what the public page shows. */}
      <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-sm p-4 flex items-center justify-between gap-4">
        <span className="font-medium truncate">Riverside United</span>
        <div className="text-center shrink-0">
          <div className="text-xl font-bold">3 – 1</div>
          <div className="text-[11px] text-gray-400">Sat, 19:30</div>
        </div>
        <span className="font-medium truncate text-right">Parkview Wanderers</span>
      </div>
    </div>
  )
}
