import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { batchGetTeams, organizerService, tournamentService } from '../lib/data'
import { findTournamentBySlug } from '../utils/urls'
import { allMatches, cardLabel, cardTotals, NO_STAT, statValue } from '../utils/matches'
import type { Tournament, Team, Match, Organizer } from '../types'
import { getSeasonUrl } from '../utils/seasons'
import {
  IconArrowLeft,
  IconBall,
  IconCard,
  IconKnockout,
  IconVideo,
} from '../components/icons'
import PublicHeader from '../components/PublicHeader'
import { youtubeEmbedUrl } from '../utils/video'

export default function PublicMatchPage() {
  const { tournamentId, matchId, orgSlug, tournamentSlug, seriesSlug, seasonSlug } = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [homeTeam, setHomeTeam] = useState<Team | null>(null)
  const [awayTeam, setAwayTeam] = useState<Team | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allOrganizers, setAllOrganizers] = useState<Organizer[]>([])

  // Load all organizers for slug-based lookup.
  //
  // getAllPublic, not getAll: this page resolves an organiser slug from the URL
  // and has to see every organiser, including the ones the visitor has nothing
  // to do with. getAll sends a signed-in user to /admin/organizers, which
  // returns only the organiser they administer — so a signed-in club manager
  // got an empty list here and every match link answered "Tournament not found".
  useEffect(() => {
    organizerService.getAllPublic().then(setAllOrganizers)
  }, [])

  // Load data directly from DynamoDB (no authentication required for public pages)
  useEffect(() => {
    const loadData = async () => {
      const hasSlugRoute = Boolean(orgSlug && (tournamentSlug || (seriesSlug && seasonSlug)))
      if ((!tournamentId && !hasSlugRoute) || !matchId) {
        setError('Missing tournament or match ID')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        let tournamentData: Tournament | null = null

        if (tournamentId) {
          // Old route: /public/tournaments/:tournamentId/matches/:matchId — single GetItem (no scan)
          tournamentData = await tournamentService.getById(tournamentId)

          if (!tournamentData) {
            setError('Tournament not found')
            setIsLoading(false)
            return
          }
        } else if (orgSlug && seriesSlug && seasonSlug) {
          // /:orgSlug/:seriesSlug/:seasonSlug/matches/:matchId — a match inside
          // a named season, which is the address every link on the season page
          // now uses. One request returns the season whole.
          const bundle = await tournamentService.getSeason(
            decodeURIComponent(orgSlug).trim(),
            decodeURIComponent(seriesSlug).trim(),
            decodeURIComponent(seasonSlug).trim(),
          )

          if (!bundle?.tournament) {
            setError('Tournament not found')
            setIsLoading(false)
            return
          }

          tournamentData = bundle.tournament
        } else if (orgSlug && tournamentSlug) {
          // New route: /:orgSlug/:tournamentSlug/matches/:matchId
          // Resolve the id from lightweight summaries (no match data), then GetItem the one tournament.
          const [organizers, summaries] = await Promise.all([
            organizerService.getAllPublic(),
            tournamentService.getAllSummaries(),
          ])
          setAllOrganizers(organizers)
          const decodedOrg = decodeURIComponent(orgSlug).trim()
          const decodedTournament = decodeURIComponent(tournamentSlug).trim()
          const summary = findTournamentBySlug(summaries, decodedOrg, decodedTournament, organizers)

          if (!summary) {
            setError('Tournament not found')
            setIsLoading(false)
            return
          }

          tournamentData = await tournamentService.getById(summary.id)

          if (!tournamentData) {
            setError('Tournament not found')
            setIsLoading(false)
            return
          }
        }

        if (!tournamentData) {
          setError('Tournament not found')
          setIsLoading(false)
          return
        }

        setTournament(tournamentData)

        // Find the match — including the rounds built by hand, which live
        // inside the format rather than in `matches`.
        const matchData = allMatches(tournamentData).find(m => m.id === matchId)
        if (!matchData) {
          setError('Match not found')
          setIsLoading(false)
          return
        }
        setMatch(matchData)

        // Load teams using batch operation (much more efficient)
        if (matchData.homeTeamId && matchData.awayTeamId) {
          const teams = await batchGetTeams([matchData.homeTeamId, matchData.awayTeamId])
          const homeTeam = teams.find(t => t.id === matchData.homeTeamId)
          const awayTeam = teams.find(t => t.id === matchData.awayTeamId)
          
          if (homeTeam) {
            setHomeTeam(homeTeam)
          }
          if (awayTeam) {
            setAwayTeam(awayTeam)
          }
        }
      } catch (err) {
        console.error('Error loading match data:', err)
        setError('Failed to load match data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [tournamentId, matchId, orgSlug, tournamentSlug, seriesSlug, seasonSlug])

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="opacity-80">Loading match...</p>
        </div>
      </div>
    )
  }

  if (error || !tournament || !match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Match Not Found</h1>
          <p className="opacity-80 mb-6">
            {error || 'The match you\'re looking for doesn\'t exist or is not publicly visible.'}
          </p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!tournament || !match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Match Not Found</h1>
          <p className="opacity-80 mb-6">The match you're looking for doesn't exist or is not publicly visible.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const getPlayerName = (playerId: string, team: typeof homeTeam) => {
    const player = team?.players.find(p => p.id === playerId)
    return player ? `${player.firstName} ${player.lastName}` : 'Unknown Player'
  }

  const getMatchStatus = () => {
    if (!match.dateISO) return 'scheduled'
    const now = new Date()
    const matchDate = new Date(match.dateISO)
    if (now < matchDate) return 'scheduled'
    // A score counts as played only when it is a number: a cleared one is
    // stored as null, and `!== undefined` called that finished.
    if (typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number') return 'finished'
    return 'live'
  }

  const matchStatus = getMatchStatus()

  const cards = cardTotals(match)

  const hasStatistics = (['home', 'away'] as const).some((side) =>
    Object.values(match.statistics?.[side] ?? {}).some((value) => typeof value === 'number'),
  )

  /**
   * What happened, in the order it happened.
   *
   * Goals and bookings are one story and are filled in by the same person at
   * the same time; as two lists side by side, working out which came first was
   * left to the reader. Copied before sorting, because the array belongs to the
   * match record this page is holding.
   */
  const events = [
    ...(match.goals ?? []).map((goal) => ({ kind: 'goal' as const, minute: goal.minute ?? 0, goal })),
    ...(match.cards ?? [])
      .filter((card) => Boolean(card.playerId))
      .map((card) => ({ kind: 'card' as const, minute: card.minute ?? 0, card })),
  ].sort((a, b) => a.minute - b.minute)

  const anyoneNamed = (['home', 'away'] as const).some(
    (side) =>
      (match.lineups?.[side]?.starting?.length ?? 0) > 0 ||
      (match.lineups?.[side]?.substitutes?.length ?? 0) > 0,
  )

  const videoEmbedUrl = youtubeEmbedUrl(match.videoUrl)

  return (
    <div className="grid gap-6 place-items-center">
      <div className="w-full">
        <PublicHeader />
      </div>

      {/* Header */}
      <section className={`glass rounded-xl p-6 w-full max-w-6xl ${match.isElimination ? 'border-2 border-red-500 bg-red-500/10' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <Link 
            to={tournament && allOrganizers.length > 0 
              ? (() => {
                  const organizer = allOrganizers.find(o => o.id === tournament.organizerId)
                  return organizer ? getSeasonUrl(tournament, organizer) : `/public/tournaments/${tournament.id}`
                })()
              : `/public/tournaments/${tournament.id}`
            } 
            className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2"
          >
            <IconArrowLeft size={15} /> Back to {tournament.name}
          </Link>
        </div>

        {/* Match Header */}
        <div className="text-center mb-6">
          <div className="text-sm opacity-70 mb-2">
            {tournament.name} • Round {match.round || 1}
            {match.isPlayoff && ` • Playoff Round ${match.playoffRound}`}
            {match.isElimination && (
              <span className="inline-flex items-center justify-center gap-1.5 ml-2 inline-block bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                <IconKnockout size={15} /> ELIMINATION MATCH
              </span>
            )}
          </div>
          
          {/* Teams and Score */}
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center">
              {/* Home Team Logo */}
              <div className="flex justify-center mb-2">
                {homeTeam.logo ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                    <img
              loading="lazy"
              decoding="async" src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: homeTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{homeTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <Link 
                to={`/public/teams/${homeTeam.id}`}
                className="text-lg font-semibold hover:opacity-80 transition-opacity"
              >
                {homeTeam.name}
              </Link>
              <div className="text-4xl font-bold text-blue-400">
                {typeof match.homeGoals === 'number' ? match.homeGoals : '-'}
              </div>
            </div>
            
            <div className="text-2xl font-bold opacity-50">vs</div>
            
            <div className="text-center">
              {/* Away Team Logo */}
              <div className="flex justify-center mb-2">
                {awayTeam.logo ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                    <img
              loading="lazy"
              decoding="async" src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: awayTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{awayTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <Link 
                to={`/public/teams/${awayTeam.id}`}
                className="text-lg font-semibold hover:opacity-80 transition-opacity"
              >
                {awayTeam.name}
              </Link>
              <div className="text-4xl font-bold text-red-400">
                {typeof match.awayGoals === 'number' ? match.awayGoals : '-'}
              </div>
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-center gap-6 text-sm">
            {match.dateISO && (
              <div>
                <span className="opacity-70">Date:</span>
                <span className="ml-2">{new Date(match.dateISO).toLocaleDateString()}</span>
              </div>
            )}
            {match.venue && (
              <div>
                <span className="opacity-70">Venue:</span>
                <span className="ml-2">{match.venue}</span>
              </div>
            )}
            {match.referee && (
              <div>
                <span className="opacity-70">Referee:</span>
                <span className="ml-2">{match.referee}</span>
              </div>
            )}
            <div>
              <span className="opacity-70">Status:</span>
              <span className={`ml-2 font-semibold ${
                matchStatus === 'finished' ? 'text-green-400' :
                matchStatus === 'live' ? 'text-yellow-400' :
                'text-blue-400'
              }`}>
                {matchStatus.charAt(0).toUpperCase() + matchStatus.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Match Statistics.

          `match.statistics &&` also passed for the empty object the editor
          leaves behind the first time it is opened, so a match nobody recorded
          anything for showed a full table of zeroes as though they were real.
          The block appears when at least one number was actually entered. */}
      {hasStatistics && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Match Statistics</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4 font-semibold">Statistic</th>
                  <th className="text-center py-3 px-4 font-semibold">{homeTeam.name}</th>
                  <th className="text-center py-3 px-4 font-semibold">{awayTeam.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Goals', home: match.homeGoals ?? 0, away: match.awayGoals ?? 0 },
                  { label: 'Shots', home: statValue(match.statistics?.home?.shots), away: statValue(match.statistics?.away?.shots) },
                  { label: 'Shots on Target', home: statValue(match.statistics?.home?.shotsOnTarget), away: statValue(match.statistics?.away?.shotsOnTarget) },
                  { label: 'Corners', home: statValue(match.statistics?.home?.corners), away: statValue(match.statistics?.away?.corners) },
                  { label: 'Fouls', home: statValue(match.statistics?.home?.fouls), away: statValue(match.statistics?.away?.fouls) },
                  // Counted from the bookings below, not stored beside them.
                  { label: 'Yellow Cards', home: cards.home.yellow, away: cards.away.yellow },
                  { label: 'Red Cards', home: cards.home.red, away: cards.away.red },
                  { label: 'Possession', home: statValue(match.statistics?.home?.possession), away: statValue(match.statistics?.away?.possession), suffix: '%' }
                ].map(stat => (
                  <tr key={stat.label} className="border-b border-white/10">
                    <td className="py-3 px-4 font-medium">{stat.label}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-blue-400 font-bold">
                        {stat.home}{stat.home === NO_STAT ? '' : stat.suffix || ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-red-400 font-bold">
                        {stat.away}{stat.away === NO_STAT ? '' : stat.suffix || ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Goals and bookings on one timeline. */}
      {events.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Match Events</h2>
          <div className="space-y-2">
            {events.map((event) => {
              const team = event.kind === 'goal'
                ? (event.goal.team === 'home' ? homeTeam : awayTeam)
                : (event.card.team === 'home' ? homeTeam : awayTeam)
              const accent = (event.kind === 'goal' ? event.goal.team : event.card.team) === 'home'
                ? 'text-blue-400'
                : 'text-red-400'

              return (
                <div
                  key={event.kind === 'goal' ? event.goal.id : event.card.id}
                  className="flex items-center justify-between p-3 glass rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono bg-white/20 px-2 py-1 rounded">
                      {event.minute}'
                    </span>
                    {event.kind === 'goal' ? (
                      <>
                        <IconBall size={15} className="opacity-70" />
                        <Link
                          to={`/public/players/${event.goal.playerId}`}
                          className={`font-semibold hover:opacity-80 transition-opacity ${accent}`}
                        >
                          {getPlayerName(event.goal.playerId, team)}
                        </Link>
                        <span className="text-sm opacity-70">
                          {event.goal.type === 'penalty' ? '(Penalty)' : event.goal.type === 'own_goal' ? '(Own Goal)' : ''}
                        </span>
                        {event.goal.assistPlayerId && (
                          <span className="text-sm opacity-70">
                            (Assist: <Link
                              to={`/public/players/${event.goal.assistPlayerId}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {getPlayerName(event.goal.assistPlayerId, team)}
                            </Link>)
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <IconCard size={15} variant={event.card.type} />
                        <Link
                          to={`/public/players/${event.card.playerId}`}
                          className={`font-semibold hover:opacity-80 transition-opacity ${accent}`}
                        >
                          {getPlayerName(event.card.playerId, team)}
                        </Link>
                        <span className="text-sm opacity-70">{cardLabel(event.card.type)}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Team Lineups */}
      {/* Named rather than merely present: a teamsheet cleared back to nobody
          leaves the record in place, and an empty panel says less than none. */}
      {anyoneNamed && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Team Lineups</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Home Team Lineup */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-blue-400">{homeTeam.name}</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 opacity-70">Starting XI</h4>
                  <div className="space-y-2">
                    {(match.lineups?.home?.starting ?? []).map((playerId) => {
                      const player = homeTeam.players.find(p => p.id === playerId)
                      return (
                        <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                          {player ? (
                            <Link 
                              to={`/public/players/${player.id}`}
                              className="text-sm hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`}
                            </Link>
                          ) : (
                            <span className="text-sm">Unknown Player</span>
                          )}
                          {player?.number && (
                            <span className="text-xs opacity-70">#{player.number}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {(match.lineups?.home?.substitutes?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 opacity-70">Substitutes</h4>
                    <div className="space-y-2">
                      {(match.lineups?.home?.substitutes ?? []).map((playerId) => {
                        const player = homeTeam.players.find(p => p.id === playerId)
                        return (
                          <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                            {player ? (
                              <Link 
                                to={`/public/players/${player.id}`}
                                className="text-sm hover:opacity-80 transition-opacity"
                              >
                                {`${player.firstName} ${player.lastName}`}
                              </Link>
                            ) : (
                              <span className="text-sm">Unknown Player</span>
                            )}
                            {player?.number && (
                              <span className="text-xs opacity-70">#{player.number}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Away Team Lineup */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-red-400">{awayTeam.name}</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 opacity-70">Starting XI</h4>
                  <div className="space-y-2">
                    {(match.lineups?.away?.starting ?? []).map((playerId) => {
                      const player = awayTeam.players.find(p => p.id === playerId)
                      return (
                        <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                          {player ? (
                            <Link 
                              to={`/public/players/${player.id}`}
                              className="text-sm hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`}
                            </Link>
                          ) : (
                            <span className="text-sm">Unknown Player</span>
                          )}
                          {player?.number && (
                            <span className="text-xs opacity-70">#{player.number}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {(match.lineups?.away?.substitutes?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 opacity-70">Substitutes</h4>
                    <div className="space-y-2">
                      {(match.lineups?.away?.substitutes ?? []).map((playerId) => {
                        const player = awayTeam.players.find(p => p.id === playerId)
                        return (
                          <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                            {player ? (
                              <Link 
                                to={`/public/players/${player.id}`}
                                className="text-sm hover:opacity-80 transition-opacity"
                              >
                                {`${player.firstName} ${player.lastName}`}
                              </Link>
                            ) : (
                              <span className="text-sm">Unknown Player</span>
                            )}
                            {player?.number && (
                              <span className="text-xs opacity-70">#{player.number}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Match Content */}
      {(match.preview || match.report || match.videoUrl) && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Match Content</h2>
          
          {match.preview && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Match Preview</h3>
              <div className="glass rounded-lg p-4">
                <p className="whitespace-pre-wrap">{match.preview}</p>
              </div>
            </div>
          )}
          
          {match.report && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Match Report</h3>
              <div className="glass rounded-lg p-4">
                <p className="whitespace-pre-wrap">{match.report}</p>
              </div>
            </div>
          )}
          
          {match.videoUrl && (
            <div>
              <h3 className="font-semibold mb-2">Match Video</h3>
              {/* Played here when the link is one this page can frame, and
                  offered as a link when it is not: an iframe pointed at a site
                  that refuses framing is a blank box with nothing to click. */}
              {videoEmbedUrl ? (
                <div className="glass rounded-lg p-2">
                  <div className="relative w-full aspect-video">
                    <iframe
                      src={videoEmbedUrl}
                      title="Match video"
                      className="absolute inset-0 w-full h-full rounded-md"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <div className="glass rounded-lg p-4 text-center">
                  <a
                    href={match.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded glass hover:bg-white/10 transition-all"
                  >
                    <IconVideo size={15} /> Watch Match Video
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
