import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { organizerService } from '../lib/data'
import type { OrganizerPage } from '../lib/data'
import PublicHeader from '../components/PublicHeader'
import NotFound from '../components/NotFound'
import { IconBall, IconShield, IconTrophy, IconUsers } from '../components/icons'
import { currentSeason, getSeasonUrl, groupIntoSeries, seasonLabel } from '../utils/seasons'
import { headerColor } from '../utils/crest'

/**
 * An organiser's own page: /homebush_futsal.
 *
 * The address is the first half of every link an organiser hands out, and the
 * site answered it with an empty screen — there was a route for
 * /:organizer/:competition and none for the segment above it. So a visitor who
 * trimmed a URL, or typed the name they were told, got nothing at all.
 *
 * What belongs here is what the organiser runs: their competitions, one row per
 * competition rather than per season, and the clubs playing in them. Private
 * seasons are absent because the API never sends them.
 */
export default function PublicOrganizerPage() {
  const { orgSlug } = useParams()
  const [page, setPage] = useState<OrganizerPage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setPage(null)

    void (async () => {
      const loaded = orgSlug ? await organizerService.getPublicPage(orgSlug) : null
      if (cancelled) return
      setPage(loaded)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [orgSlug])

  useEffect(() => {
    if (page) document.title = `${page.organizer.name} — MFTournament`
  }, [page])

  /**
   * One row per competition, opening whichever season is current. Seasons of a
   * league share its name, so listing seasons printed the same league twice
   * with nothing on screen to tell the entries apart; the earlier ones are
   * reached from the season switcher on the page the row opens.
   */
  const competitions = useMemo(() => {
    if (!page) return []
    return groupIntoSeries(page.tournaments)
      .map((series) => ({
        key: series.key,
        name: series.name,
        seasons: series.seasons,
        current: currentSeason(series.seasons) ?? series.seasons[0],
      }))
      .sort(
        (a, b) =>
          new Date(b.current.createdAtISO || 0).getTime() -
          new Date(a.current.createdAtISO || 0).getTime(),
      )
  }, [page])

  const clubName = useMemo(
    () => new Map((page?.clubs ?? []).map((club) => [club.id, club.name])),
    [page],
  )

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
          <p className="opacity-80">Loading…</p>
        </div>
      </div>
    )
  }

  // Any address of one segment lands on this page, so a mistyped one is a 404
  // rather than an error: /nonsense is not an organiser.
  if (!page) return <NotFound />

  const { organizer, clubs } = page

  return (
    <div className="min-h-screen">
      <PublicHeader />

      <div className="container mx-auto px-4 pb-16">
        {/* ---------- Who this is ---------- */}
        <header className="py-8 sm:py-12 flex items-center gap-5">
          {organizer.logo ? (
            <img
              src={organizer.logo}
              alt=""
              decoding="async"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border border-white/15 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/15 flex items-center justify-center text-3xl font-semibold shrink-0">
              {organizer.name?.charAt(0).toUpperCase() || 'O'}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold truncate">{organizer.name}</h1>
            {organizer.description && (
              <p className="mt-2 text-gray-300 max-w-2xl">{organizer.description}</p>
            )}
            <p className="mt-2 text-sm text-gray-400">
              {competitions.length} {competitions.length === 1 ? 'competition' : 'competitions'}
              {clubs.length > 0 && (
                <>
                  {' · '}
                  {clubs.length} {clubs.length === 1 ? 'club' : 'clubs'}
                </>
              )}
            </p>
          </div>
        </header>

        {/* ---------- What they run ---------- */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Competitions</h2>

          {competitions.length === 0 ? (
            <p className="text-gray-400 py-4">
              Nothing published yet. A competition appears here once its organiser makes it public.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {competitions.map((competition) => {
                const champion = competition.current.championTeamId
                  ? clubName.get(competition.current.championTeamId)
                  : undefined

                return (
                  <article
                    key={competition.key}
                    className="rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors p-5"
                  >
                    <Link
                      to={getSeasonUrl(competition.current, organizer)}
                      className="flex items-center gap-3 group"
                    >
                      {competition.current.logo ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={competition.current.logo}
                          alt=""
                          className="w-10 h-10 rounded object-contain shrink-0"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded bg-white/5 flex items-center justify-center text-white/50 shrink-0">
                          <IconBall size={18} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold truncate group-hover:text-blue-300 transition-colors">
                          {competition.name}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {seasonLabel(competition.current)}
                          {Boolean(competition.current.teamCount) &&
                            ` · ${competition.current.teamCount} teams`}
                          {competition.current.status === 'running' && ' · in progress'}
                          {competition.current.status === 'upcoming' && ' · not started'}
                        </span>
                      </span>
                    </Link>

                    {champion && (
                      <p className="mt-3 flex items-center gap-2 text-sm text-gray-300">
                        <IconTrophy size={15} /> {champion}
                      </p>
                    )}

                    {/* Every season, where there is more than one: the row above
                        opens the current one, and these are the years behind it. */}
                    {competition.seasons.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {competition.seasons.map((season) => (
                          <Link
                            key={season.id}
                            to={getSeasonUrl(season, organizer)}
                            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-gray-300 transition-colors"
                          >
                            {seasonLabel(season)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* ---------- Who plays in them ---------- */}
        {clubs.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <IconUsers size={18} /> Clubs
            </h2>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {clubs
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((club) => (
                  <Link
                    key={club.id}
                    to={`/public/teams/${club.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-colors min-w-0"
                  >
                    {club.logo ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={club.logo}
                        alt=""
                        className="w-9 h-9 rounded-full object-contain bg-white/5 shrink-0"
                      />
                    ) : (
                      // `background`, the shorthand, printed the club's stored
                      // colour raw — and the shorthand accepts `url(...)`.
                      // Clubs created before the API checked `colors` can hold
                      // one, so both halves of that fix apply here: the value
                      // goes through `headerColor`, which returns a colour or
                      // the fallback and nothing else, and it is set on
                      // `backgroundColor`, which cannot fetch anything.
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-white/15"
                        style={{ backgroundColor: headerColor(club) }}
                      >
                        <IconShield size={16} />
                      </span>
                    )}
                    <span className="text-sm truncate">{club.name}</span>
                  </Link>
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
