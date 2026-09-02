import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useState, useEffect, useMemo } from 'react'
import { uid } from '../utils/uid'
import { findTournamentBySlug, getPublicTournamentUrl } from '../utils/urls'
import { adminSeasonUrl } from '../utils/seasons'
import { organizerService } from '../lib/data'
import type { Organizer, Player } from '../types'
import MatchDateTime from '../components/MatchDateTime'
import InlineInput from '../components/InlineInput'
import InlineTextarea from '../components/InlineTextarea'
import {
  IconBall,
  IconArrowLeft,
  IconCard,
  IconClipboard,
} from '../components/icons'
import { playersForPicking, registeredPlayers } from '../utils/squads'
import { youtubeEmbedUrl } from '../utils/video'
import { cardLabel, cardTotals, findMatch, roundLabel, statValue } from '../utils/matches'
import type { CardType } from '../utils/matches'

/**
 * The team totals somebody types in, in the order the table shows them.
 *
 * Goals are not one of them: the score is edited on the scoreboard, and the
 * cards are counted from the bookings.
 */
const STATISTIC_ROWS: Array<{
  label: string
  field: 'shots' | 'shotsOnTarget' | 'corners' | 'fouls' | 'possession'
  suffix?: string
}> = [
  { label: 'Shots', field: 'shots' },
  { label: 'Shots on Target', field: 'shotsOnTarget' },
  { label: 'Corners', field: 'corners' },
  { label: 'Fouls', field: 'fouls' },
  { label: 'Possession', field: 'possession', suffix: '%' },
]

export default function MatchPage() {
  const { tournamentId, matchId, orgSlug, tournamentSlug } = useParams()
  const { getCurrentOrganizer, getOrganizerById, getOrganizerTeams, getOrganizerTournaments, updateMatchFields, setLineup, superAdmin } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  const [allOrganizers, setAllOrganizers] = useState<Organizer[]>([])
  
  // Load all organizers for slug-based lookup
  useEffect(() => {
    organizerService.getAll().then(setAllOrganizers)
  }, [])

  // Support both old ID-based route and new slug-based route
  const tournament = useMemo(() => {
    if (tournamentId) {
      // Id route: /tournaments/:tournamentId/matches/:matchId
      return tournaments.find(t => t.id === tournamentId)
    } else if (orgSlug && tournamentSlug) {
      // Slug route: /tournaments/:orgSlug/:tournamentSlug/matches/:matchId
      return findTournamentBySlug(tournaments, orgSlug, tournamentSlug, allOrganizers)
    }
    return undefined
  }, [tournamentId, orgSlug, tournamentSlug, tournaments, allOrganizers])
  // Wherever the competition keeps it. A hand-built playoff round stores its
  // fixtures inside the format rather than in `matches`, and this screen used
  // to answer "Match not found" for every one of them — which is why their
  // goals, cards and teamsheets had nowhere to be entered.
  const match = findMatch(tournament, matchId)
  
  const homeTeam = teams.find(t => t.id === match?.homeTeamId)
  const awayTeam = teams.find(t => t.id === match?.awayTeamId)

  const [activeTab, setActiveTab] = useState<'overview' | 'statistics' | 'lineups' | 'goals' | 'content'>('overview')

  // The organizer running this competition, which is not the same as whoever is
  // signed in: the super admin runs none of them.
  const organizer = getOrganizerById(tournament?.organizerId) ?? currentOrganizer

  if (!currentOrganizer && !superAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">No Organizer Selected</h1>
          <p className="opacity-80 mb-6">Please select an organizer first</p>
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
          <p className="opacity-80 mb-6">The match you're looking for doesn't exist or you don't have access to it.</p>
          <Link to="/tournaments" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to Tournaments
          </Link>
        </div>
      </div>
    )
  }

  // One match, through the route that writes one match. This used to send the
  // competition's whole `matches` array back from the copy this page loaded,
  // which undid every edit made elsewhere since — including the teamsheets the
  // clubs' own managers now write.
  const updateMatch = (updates: Partial<typeof match>) => {
    if (!tournament || !matchId) return
    updateMatchFields(tournament.id, matchId, updates).catch((error) => {
      console.error('Error updating match:', error)
    })
  }

  /**
   * The score the recorded events add up to.
   *
   * The two used to be stored side by side and reconciled by hand, so a goal
   * entered here left the season's table showing the old result until somebody
   * remembered to retype it. Adding or removing an event now moves the score
   * with it, in the same write.
   *
   * The score stays a field of its own, and is still editable on the scoreboard
   * above: most matches in this app have a result and no events at all, and a
   * score derived from an empty list would read 0-0 for every one of them. So
   * this is applied only when the event list itself changes.
   */
  const scoreOf = (goals: NonNullable<typeof match.goals>) => ({
    homeGoals: goals.filter(g => g.team === 'home').length,
    awayGoals: goals.filter(g => g.team === 'away').length,
  })

  const updateGoal = (goalId: string, updates: Partial<{ minute: number; playerId: string; assistPlayerId?: string; type: 'goal' | 'penalty' | 'own_goal' }>) => {
    if (!goalId) {
      // Don't create goals automatically - this should only happen when explicitly adding goals
      return
    }

    const goals = match.goals?.map(g => 
      g.id === goalId ? { ...g, ...updates } : g
    ) || []
    updateMatch({ goals })
  }

  const createGoal = (team: 'home' | 'away', goalNumber: number) => {
    const newGoal = {
      id: uid(),
      team,
      playerId: '',
      minute: 0,
      type: 'goal' as 'goal' | 'penalty' | 'own_goal',
      assistPlayerId: undefined,
      goalNumber
    }
    const goals = [...(match.goals || []), newGoal]
    updateMatch({ goals, ...scoreOf(goals) })
  }

  const createCard = (team: 'home' | 'away') => {
    const cards = [
      ...(match.cards ?? []),
      { id: uid(), team, playerId: '', minute: 0, type: 'yellow' as CardType },
    ]
    updateMatch({ cards })
  }

  const updateCard = (
    cardId: string,
    updates: Partial<{ minute: number; playerId: string; type: CardType }>,
  ) => {
    updateMatch({
      cards: (match.cards ?? []).map((card) => (card.id === cardId ? { ...card, ...updates } : card)),
    })
  }

  const deleteCard = (cardId: string) => {
    updateMatch({ cards: (match.cards ?? []).filter((card) => card.id !== cardId) })
  }

  /**
   * One event gone, and the score with it. Written once: this was two calls,
   * so the second could reach the API before the first and put the old score
   * back beside the shorter list.
   */
  const deleteGoal = (goalId: string) => {
    const goals = match.goals?.filter(g => g.id !== goalId) || []
    updateMatch({ goals, ...scoreOf(goals) })
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
    // A cleared score is stored as null, which `!== undefined` read as finished.
    if (typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number') return 'finished'
    return 'live'
  }

  const matchStatus = getMatchStatus()

  // Counted from the bookings, which are the only place they are written now.
  const cardsShown = cardTotals(match)

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link 
            to={adminSeasonUrl(tournament, organizer)} 
            className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2"
          >
            <IconArrowLeft size={15} /> Back to {tournament.name}
          </Link>
        
          {/* Public Link */}
          <div className="text-center">
            <label className="block text-sm font-medium mb-2">Public Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={organizer
                  ? `${window.location.origin}${getPublicTournamentUrl(tournament, organizer)}/matches/${match.id}`
                  : `${window.location.origin}/public/tournaments/${tournament.id}/matches/${match.id}`
                }
                className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-center min-w-[300px] text-sm"
              />
              <button
                onClick={() => {
                  const url = organizer
                    ? `${window.location.origin}${getPublicTournamentUrl(tournament, organizer)}/matches/${match.id}`
                    : `${window.location.origin}/public/tournaments/${tournament.id}/matches/${match.id}`
                  navigator.clipboard.writeText(url)
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                title="Copy to clipboard"
              >
                <IconClipboard size={15} /> Copy
              </button>
            </div>
          </div>
        </div>

        {/* Match Header */}
        <div className="text-center mb-6">
          <div className="text-sm opacity-70 mb-2">
            {tournament.name} • {roundLabel(match)}
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
              <div className="text-lg font-semibold">{homeTeam.name}</div>
              {/* The result is edited here, on the scoreboard, which is where
                  anyone looks for it. It used to be reachable only as a row of
                  the Statistics table, behind another tab. */}
              <InlineInput
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`${homeTeam.name} score`}
                placeholder="-"
                value={typeof match.homeGoals === 'number' ? match.homeGoals : ''}
                onCommit={(value) => updateMatch({ homeGoals: value === '' ? undefined : Number(value) })}
                className="w-24 mx-auto block text-center text-4xl font-bold text-blue-400 bg-transparent rounded-md border border-white/10 hover:border-white/25 focus:border-white/40 focus:outline-none"
              />
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
              <div className="text-lg font-semibold">{awayTeam.name}</div>
              <InlineInput
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`${awayTeam.name} score`}
                placeholder="-"
                value={typeof match.awayGoals === 'number' ? match.awayGoals : ''}
                onCommit={(value) => updateMatch({ awayGoals: value === '' ? undefined : Number(value) })}
                className="w-24 mx-auto block text-center text-4xl font-bold text-red-400 bg-transparent rounded-md border border-white/10 hover:border-white/25 focus:border-white/40 focus:outline-none"
              />
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-center gap-6 text-sm">
            <div>
              <span className="opacity-70">Date:</span>
              <div className="flex gap-2 ml-2">
                <MatchDateTime
                  value={match.dateISO}
                  onChange={(iso) => updateMatch({ dateISO: iso })}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <span className="opacity-70">Venue:</span>
          <InlineInput
                type="text"
                value={match.venue || ''}
                onCommit={(value) => updateMatch({ venue: value || undefined })}
                placeholder="Enter venue"
                className="ml-2 px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
          />
        </div>
            <div>
              <span className="opacity-70">Referee:</span>
          <InlineInput
                type="text"
                value={match.referee || ''}
                onCommit={(value) => updateMatch({ referee: value || undefined })}
                placeholder="Enter referee"
                className="ml-2 px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
              />
            </div>
            <div>
              <span className="opacity-70">Status:</span>
              <select
                value={matchStatus}
                onChange={(e) => updateMatch({ status: e.target.value as any })}
                className="ml-2 px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
              >
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="finished">Finished</option>
                <option value="postponed">Postponed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex gap-2 mb-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'statistics', label: 'Statistics' },
            { id: 'lineups', label: 'Lineups' },
            { id: 'goals', label: 'Goals & Events' },
            { id: 'content', label: 'Content' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id 
                  ? 'bg-white/20 text-white' 
                  : 'bg-transparent text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
                        {/* Match Statistics Overview */}
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
                    { label: 'Goals', home: statValue(match.homeGoals), away: statValue(match.awayGoals) },
                    { label: 'Shots', home: statValue(match.statistics?.home.shots), away: statValue(match.statistics?.away.shots) },
                    { label: 'Shots on Target', home: statValue(match.statistics?.home.shotsOnTarget), away: statValue(match.statistics?.away.shotsOnTarget) },
                    { label: 'Corners', home: statValue(match.statistics?.home.corners), away: statValue(match.statistics?.away.corners) },
                    { label: 'Fouls', home: statValue(match.statistics?.home.fouls), away: statValue(match.statistics?.away.fouls) },
                    { label: 'Yellow Cards', home: cardsShown.home.yellow, away: cardsShown.away.yellow },
                    { label: 'Red Cards', home: cardsShown.home.red, away: cardsShown.away.red },
                    // The percent sign is attached here rather than in the cell,
                    // so a possession nobody entered reads as a dash and not "-%".
                    {
                      label: 'Possession',
                      home: typeof match.statistics?.home.possession === 'number' ? `${match.statistics.home.possession}%` : statValue(undefined),
                      away: typeof match.statistics?.away.possession === 'number' ? `${match.statistics.away.possession}%` : statValue(undefined),
                    }
                  ].map(stat => (
                    <tr key={stat.label} className="border-b border-white/10">
                      <td className="py-3 px-4 font-medium">{stat.label}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-blue-400 font-bold">{stat.home}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-red-400 font-bold">{stat.away}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Goals Timeline */}
            {match.goals && match.goals.length > 0 && (
              <div>
                <h3 className="font-semibold mb-4">Goals Timeline</h3>
                <div className="space-y-2">
                  {match.goals
                    .sort((a, b) => a.minute - b.minute)
                    .map(goal => (
                    <div key={goal.id} className="flex items-center justify-between p-3 glass rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono bg-white/20 px-2 py-1 rounded">
                          {goal.minute}'
                        </span>
                        <span className={`font-semibold ${goal.team === 'home' ? 'text-blue-400' : 'text-red-400'}`}>
                          {getPlayerName(goal.playerId, goal.team === 'home' ? homeTeam : awayTeam)}
                        </span>
                        <span className="text-sm opacity-70">
                          {goal.type === 'penalty' ? '(Penalty)' : goal.type === 'own_goal' ? '(Own Goal)' : ''}
                        </span>
                        {goal.assistPlayerId && (
                          <span className="text-sm opacity-70">
                            (Assist: {getPlayerName(goal.assistPlayerId, goal.team === 'home' ? homeTeam : awayTeam)})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="space-y-6">
            <h3 className="font-semibold mb-4">Match Statistics</h3>
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
                  {/* The score is not typed here. It sits on the scoreboard at
                      the top of the page, where anyone looks for it, and a
                      second field for the same number is a second answer
                      waiting to disagree with the first. */}
                  <tr className="border-b border-white/10">
                    <td className="py-3 px-4 font-medium">Goals</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-blue-400 font-bold">{statValue(match.homeGoals)}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-red-400 font-bold">{statValue(match.awayGoals)}</span>
                    </td>
                  </tr>
                  {STATISTIC_ROWS.map(stat => (
                    <tr key={stat.label} className="border-b border-white/10">
                      <td className="py-3 px-4 font-medium">{stat.label}</td>
                      {(['home', 'away'] as const).map(side => (
                        <td key={side} className="py-3 px-4 text-center">
                          {/* On blur, not on every keystroke: each save rewrites
                              the whole statistics record, and typing "12" used
                              to be two of them racing each other. */}
                          <InlineInput
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label={`${stat.label}, ${side === 'home' ? homeTeam.name : awayTeam.name}`}
                            value={match.statistics?.[side]?.[stat.field] ?? ''}
                            onCommit={(entered) => {
                              const statistics = {
                                home: { ...match.statistics?.home },
                                away: { ...match.statistics?.away },
                              }
                              statistics[side][stat.field] = entered === '' ? undefined : Number(entered)
                              updateMatch({ statistics })
                            }}
                            className="w-20 px-2 py-1 rounded bg-transparent border border-white/20 text-center text-sm focus:border-white/40 focus:outline-none"
                          />
                          <span className="text-sm ml-1">{stat.suffix || ''}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Not typed here. Both numbers are counted from the bookings
                      on the Goals & Events tab, because a total stored beside
                      the events it comes from is a second answer waiting to
                      disagree with the first. */}
                  {[
                    { label: 'Yellow Cards', home: cardsShown.home.yellow, away: cardsShown.away.yellow },
                    { label: 'Red Cards', home: cardsShown.home.red, away: cardsShown.away.red },
                  ].map(stat => (
                    <tr key={stat.label} className="border-b border-white/10">
                      <td className="py-3 px-4 font-medium">{stat.label}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-blue-400 font-bold">{stat.home}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-red-400 font-bold">{stat.away}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm opacity-70">
              Yellow and red cards are counted from the bookings recorded on the Goals and events
              tab. A second yellow counts as both.
            </p>
          </div>
        )}

        {activeTab === 'lineups' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Team Lineups</h3>
              <p className="text-sm opacity-70 mt-1">
                Who played. Each club's manager can name their own side from their club page, and
                either teamsheet can be corrected here afterwards.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <LineupPicker
                name={homeTeam.name}
                accent="text-blue-400"
                players={registeredPlayers(tournament, homeTeam)}
                saved={match.lineups?.home?.starting ?? []}
                onSave={(playerIds) =>
                  setLineup(tournament.id, match.id, homeTeam.id, playerIds)
                }
              />
              <LineupPicker
                name={awayTeam.name}
                accent="text-red-400"
                players={registeredPlayers(tournament, awayTeam)}
                saved={match.lineups?.away?.starting ?? []}
                onSave={(playerIds) =>
                  setLineup(tournament.id, match.id, awayTeam.id, playerIds)
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-xl">Goals & Events</h3>
              <div className="text-sm text-gray-400">
                {match.homeGoals || 0} - {match.awayGoals || 0}
              </div>
            </div>
            
            {/* Add Goal Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  const homeGoalCount = match.goals?.filter(g => g.team === 'home').length || 0
                  createGoal('home', homeGoalCount + 1)
                }}
                className="px-4 py-2 rounded-lg glass hover:bg-blue-500/20 transition-all border border-blue-400/30 text-blue-400"
              >
                + Add {homeTeam.name} Goal
              </button>
              <button
                onClick={() => {
                  const awayGoalCount = match.goals?.filter(g => g.team === 'away').length || 0
                  createGoal('away', awayGoalCount + 1)
                }}
                className="px-4 py-2 rounded-lg glass hover:bg-red-500/20 transition-all border border-red-400/30 text-red-400"
              >
                + Add {awayTeam.name} Goal
              </button>
            </div>
            
            {/* Goals List */}
            <div className="space-y-4">
              {match.goals && match.goals.length > 0 ? (
                match.goals
                  .sort((a, b) => a.minute - b.minute)
                  .map(goal => {
                    const team = goal.team === 'home' ? homeTeam : awayTeam
                    const isHomeTeam = goal.team === 'home'
                    return (
                      <div key={goal.id} className="glass rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 ${isHomeTeam ? 'bg-blue-500/20 border-blue-400/30' : 'bg-red-500/20 border-red-400/30'} rounded-full flex items-center justify-center border`}>
                              <span className={`font-bold ${isHomeTeam ? 'text-blue-400' : 'text-red-400'}`}>
                                {goal.goalNumber || 1}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {team.logo && (
                                <img
              loading="lazy"
              decoding="async" src={team.logo} alt={`${team.name} logo`} className="w-8 h-8 rounded-full object-cover" />
                              )}
                              <span className={`font-semibold ${isHomeTeam ? 'text-blue-400' : 'text-red-400'}`}>
                                {team.name} Goal #{goal.goalNumber || 1}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteGoal(goal.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                        
                        <div className="grid md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Minute</label>
                            <InlineInput
                              type="number"
                              min="1"
                              max="120"
                              value={goal.minute || ''}
                              onCommit={(value) => updateGoal(goal.id, { minute: Number(value) })}
                              className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                isHomeTeam 
                                  ? 'focus:border-blue-400/50 focus:ring-blue-400/20' 
                                  : 'focus:border-red-400/50 focus:ring-red-400/20'
                              }`}
                              placeholder="Minute"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Scorer</label>
                            <select
                              value={goal.playerId || ''}
                              onChange={(e) => updateGoal(goal.id, { playerId: e.target.value })}
                              className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                isHomeTeam 
                                  ? 'focus:border-blue-400/50 focus:ring-blue-400/20' 
                                  : 'focus:border-red-400/50 focus:ring-red-400/20'
                              }`}
                            >
                              <option value="">Select Scorer</option>
                              {playersForPicking(tournament, team, goal.playerId).map(player => (
                                <option key={player.id} value={player.id}>
                                  {player.firstName} {player.lastName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Assist Provider</label>
                            <select
                              value={goal.assistPlayerId || ''}
                              onChange={(e) => updateGoal(goal.id, { assistPlayerId: e.target.value || undefined })}
                              className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                isHomeTeam 
                                  ? 'focus:border-blue-400/50 focus:ring-blue-400/20' 
                                  : 'focus:border-red-400/50 focus:ring-red-400/20'
                              }`}
                            >
                              <option value="">No Assist</option>
                              {playersForPicking(tournament, team, goal.assistPlayerId).map(player => (
                                <option key={player.id} value={player.id}>
                                  {player.firstName} {player.lastName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Type</label>
                            <select
                              value={goal.type || 'goal'}
                              onChange={(e) => updateGoal(goal.id, { type: e.target.value as 'goal' | 'penalty' | 'own_goal' })}
                              className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                isHomeTeam 
                                  ? 'focus:border-blue-400/50 focus:ring-blue-400/20' 
                                  : 'focus:border-red-400/50 focus:ring-red-400/20'
                              }`}
                            >
                              <option value="goal">Goal</option>
                              <option value="penalty">Penalty</option>
                              <option value="own_goal">Own Goal</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })
              ) : (
                <div className="glass rounded-xl p-8 text-center">
                  <div className="mb-4 flex justify-center opacity-60"><IconBall size={36} /></div>
                  <h4 className="font-semibold text-lg mb-2">No Goals Yet</h4>
                  <p className="text-gray-400">Click the buttons above to add goals</p>
                </div>
              )}
            </div>

            {/* Bookings. Recorded here rather than as two numbers on the
                statistics tab: who was booked is the part a visitor comes for,
                and the totals fall out of the list on their own. */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xl">Cards</h3>
                <div className="text-sm text-gray-400 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <IconCard size={14} variant="yellow" />
                    {cardsShown.home.yellow + cardsShown.away.yellow}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <IconCard size={14} variant="red" />
                    {cardsShown.home.red + cardsShown.away.red}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => createCard('home')}
                  className="px-4 py-2 rounded-lg glass hover:bg-blue-500/20 transition-all border border-blue-400/30 text-blue-400"
                >
                  + Add {homeTeam.name} card
                </button>
                <button
                  onClick={() => createCard('away')}
                  className="px-4 py-2 rounded-lg glass hover:bg-red-500/20 transition-all border border-red-400/30 text-red-400"
                >
                  + Add {awayTeam.name} card
                </button>
              </div>

              {(match.cards?.length ?? 0) > 0 ? (
                <div className="space-y-4">
                  {/* Copied before sorting: the array belongs to the record this
                      page is holding, and sorting it in place reorders it there. */}
                  {[...(match.cards ?? [])]
                    .sort((a, b) => a.minute - b.minute)
                    .map(card => {
                      const team = card.team === 'home' ? homeTeam : awayTeam
                      const isHomeTeam = card.team === 'home'
                      return (
                        <div key={card.id} className="glass rounded-xl p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <IconCard size={20} variant={card.type} />
                              {team.logo && (
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={team.logo}
                                  alt={`${team.name} logo`}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              )}
                              <span className={`font-semibold ${isHomeTeam ? 'text-blue-400' : 'text-red-400'}`}>
                                {team.name} — {cardLabel(card.type)}
                              </span>
                            </div>
                            <button
                              onClick={() => deleteCard(card.id)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="grid md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-medium mb-2">Minute</label>
                              <InlineInput
                                type="number"
                                min="1"
                                max="120"
                                value={card.minute || ''}
                                onCommit={(value) => updateCard(card.id, { minute: Number(value) })}
                                className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                  isHomeTeam
                                    ? 'focus:border-blue-400/50 focus:ring-blue-400/20'
                                    : 'focus:border-red-400/50 focus:ring-red-400/20'
                                }`}
                                placeholder="Minute"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-2">Player</label>
                              <select
                                value={card.playerId || ''}
                                onChange={(e) => updateCard(card.id, { playerId: e.target.value })}
                                className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                  isHomeTeam
                                    ? 'focus:border-blue-400/50 focus:ring-blue-400/20'
                                    : 'focus:border-red-400/50 focus:ring-red-400/20'
                                }`}
                              >
                                <option value="">Select player</option>
                                {playersForPicking(tournament, team, card.playerId).map(player => (
                                  <option key={player.id} value={player.id}>
                                    {player.firstName} {player.lastName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-2">Card</label>
                              <select
                                value={card.type}
                                onChange={(e) => updateCard(card.id, { type: e.target.value as CardType })}
                                className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:ring-2 transition-all ${
                                  isHomeTeam
                                    ? 'focus:border-blue-400/50 focus:ring-blue-400/20'
                                    : 'focus:border-red-400/50 focus:ring-red-400/20'
                                }`}
                              >
                                <option value="yellow">Yellow card</option>
                                <option value="second_yellow">Second yellow</option>
                                <option value="red">Red card</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="glass rounded-xl p-8 text-center">
                  <div className="mb-4 flex justify-center"><IconCard size={36} /></div>
                  <h4 className="font-semibold text-lg mb-2">No cards yet</h4>
                  <p className="text-gray-400">Add a booking with the buttons above</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-6">
            <h3 className="font-semibold mb-4">Match Content</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Match video</label>
                <InlineInput
                  type="url"
                  value={match.videoUrl || ''}
                  onCommit={(value) => updateMatch({ videoUrl: value || undefined })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                />
                <p className="text-sm opacity-70 mt-2">
                  A YouTube link plays on the public match page. Any other address is shown
                  there as a link instead, because a page that refuses to be framed would
                  leave a blank box.
                </p>
                {/* Said here rather than on the public page, where nobody who can
                    fix it is looking. */}
                {match.videoUrl && !youtubeEmbedUrl(match.videoUrl) && (
                  <p className="text-sm text-yellow-300 mt-1">
                    This is not a YouTube address, so visitors get a link rather than a player.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Match Preview</label>
                <InlineTextarea
                  value={match.preview}
                  onCommit={(value) => updateMatch({ preview: value || undefined })}
                  placeholder="Enter match preview..."
                  rows={4}
                  className="w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Match Report</label>
                <InlineTextarea
                  value={match.report}
                  onCommit={(value) => updateMatch({ report: value || undefined })}
                  placeholder="Enter match report..."
                  rows={6}
                  className="w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                />
          </div>

            </div>
          </div>
        )}
      </section>
    </div>
  )
}


/**
 * One club's teamsheet.
 *
 * Saved a tick at a time, and only ever this club's side of the fixture: the
 * opposing manager may be naming theirs on a phone at the same moment, and a
 * write that carried both would undo them.
 */
function LineupPicker({
  name,
  accent,
  players,
  saved,
  onSave,
}: {
  name: string
  accent: string
  players: Player[]
  saved: string[]
  onSave: (playerIds: string[]) => Promise<void>
}) {
  const [chosen, setChosen] = useState<string[]>(saved)
  const [error, setError] = useState<string | null>(null)

  // The stored list is the truth. Re-syncing on its contents rather than its
  // identity keeps a save made elsewhere from being reverted by a re-render,
  // without fighting the tick the person just made here.
  useEffect(() => {
    setChosen(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.join(',')])

  const toggle = async (playerId: string) => {
    const before = chosen
    const next = before.includes(playerId)
      ? before.filter((id) => id !== playerId)
      : [...before, playerId]

    setChosen(next)
    setError(null)
    try {
      await onSave(next)
    } catch (caught) {
      setChosen(before)
      setError(caught instanceof Error && caught.message ? caught.message : 'That could not be saved.')
    }
  }

  return (
    <div className="glass rounded-lg p-4">
      <h4 className={`font-semibold mb-4 ${accent}`}>{name}</h4>
      {players.length === 0 ? (
        <p className="text-sm opacity-60">No players registered for this competition.</p>
      ) : (
        <>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {players.map((player) => {
              const on = chosen.includes(player.id)
              return (
                <label
                  key={player.id}
                  className="flex items-center justify-between p-2 glass rounded cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(player.id)}
                      className="w-4 h-4 rounded border border-white/20"
                    />
                    <span className="text-sm">
                      {player.firstName} {player.lastName}
                    </span>
                    {player.number && <span className="text-xs opacity-70">#{player.number}</span>}
                    {player.position && (
                      <span className="text-xs opacity-70">({player.position})</span>
                    )}
                  </div>
                  {on && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                      Playing
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          <div className="mt-3 text-sm opacity-70">Selected: {chosen.length} players</div>
          {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
        </>
      )}
    </div>
  )
}
