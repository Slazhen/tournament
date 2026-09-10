import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useState, useEffect, useMemo } from 'react'
import { findTournamentBySlug, getPublicTournamentUrl } from '../utils/urls'
import { adminSeasonUrl } from '../utils/seasons'
import { organizerService } from '../lib/data'
import type { Organizer, Player } from '../types'
import MatchDateTime from '../components/MatchDateTime'
import InlineInput from '../components/InlineInput'
import InlineTextarea from '../components/InlineTextarea'
import MatchEvents from '../components/MatchEvents'
import {
  IconArrowLeft,
  IconClipboard,
} from '../components/icons'
import { registeredPlayers } from '../utils/squads'
import { numberInMatch } from '../utils/players'
import { youtubeEmbedUrl } from '../utils/video'
import { byMinute, cardTotals, findMatch, roundLabel, scorerSide, statValue } from '../utils/matches'
import { cdnUrl } from '../utils/images'

/**
 * The team totals somebody types in, in the order the table shows them.
 *
 * Goals are not one of them: the score is edited on the scoreboard, and the
 * cards are counted from the bookings.
 */
type MatchTab = 'overview' | 'statistics' | 'lineups' | 'goals' | 'content'

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
  const { getCurrentOrganizer, getOrganizerById, getOrganizerTeams, getOrganizerTournaments, updateMatchFields, addGoal, updateGoal, removeGoal, setLineup, superAdmin } = useAppStore()

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

  const [activeTab, setActiveTab] = useState<MatchTab>('overview')

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
   * One goal gone, through the route that writes one goal.
   *
   * The score is deliberately left alone. A goal now has two authors — this
   * screen and the manager of the club it counts for — and what a deletion
   * takes away is the name on it, not the goal: the result stands and the goal
   * goes back to being one nobody has named. A wrong result is corrected on the
   * scoreboard above, which is where it was typed.
   */
  const deleteGoal = (goalId: string) => {
    if (!tournament || !matchId) return
    removeGoal(tournament.id, matchId, goalId).catch((error) => {
      console.error('Error removing goal:', error)
    })
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
              decoding="async" src={cdnUrl(homeTeam.logo)} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
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
              decoding="async" src={cdnUrl(awayTeam.logo)} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
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
          {([
            { id: 'overview', label: 'Overview' },
            { id: 'statistics', label: 'Statistics' },
            { id: 'lineups', label: 'Lineups' },
            { id: 'goals', label: 'Goals & Events' },
            { id: 'content', label: 'Content' },
          ] satisfies Array<{ id: MatchTab; label: string }>).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
                  {byMinute(match.goals).map(goal => (
                    <div key={goal.id} className="flex items-center justify-between p-3 glass rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono bg-white/20 px-2 py-1 rounded">
                          {typeof goal.minute === 'number' ? `${goal.minute}'` : '-'}
                        </span>
                        <span className={`font-semibold ${goal.team === 'home' ? 'text-blue-400' : 'text-red-400'}`}>
                          {getPlayerName(goal.playerId, scorerSide(goal) === 'home' ? homeTeam : awayTeam)}
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
                Who played, and in which shirt. Each club's manager can name their own side from
                their club page, and either teamsheet can be corrected here afterwards. A number is
                the club's own unless it is changed here, and then it applies to this match alone.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <LineupPicker
                name={homeTeam.name}
                accent="text-blue-400"
                players={registeredPlayers(tournament, homeTeam)}
                saved={match.lineups?.home?.starting ?? []}
                savedNumbers={match.lineups?.home?.numbers}
                onSave={(playerIds, numbers) =>
                  setLineup(tournament.id, match.id, homeTeam.id, playerIds, numbers)
                }
              />
              <LineupPicker
                name={awayTeam.name}
                accent="text-red-400"
                players={registeredPlayers(tournament, awayTeam)}
                saved={match.lineups?.away?.starting ?? []}
                savedNumbers={match.lineups?.away?.numbers}
                onSave={(playerIds, numbers) =>
                  setLineup(tournament.id, match.id, awayTeam.id, playerIds, numbers)
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'goals' && (
          <MatchEvents
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            onSave={updateMatch}
            onAddGoal={(goal) => addGoal(tournament.id, match.id, goal)}
            onUpdateGoal={(goalId, goal) => updateGoal(tournament.id, match.id, goalId, goal)}
            onDeleteGoal={(goalId) => removeGoal(tournament.id, match.id, goalId)}
            onGoToLineups={() => setActiveTab('lineups')}
          />
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
 * One club's teamsheet, and the shirt each of them wore.
 *
 * Saved a tick at a time, and only ever this club's side of the fixture: the
 * opposing manager may be naming theirs on a phone at the same moment, and a
 * write that carried both would undo them.
 *
 * The number box is pre-filled with the club's own number and only what somebody
 * changes is stored, so a sheet nobody renumbers is written exactly as it was
 * before this existed. Clearing the box puts the player back on the club number
 * rather than leaving them with none — a player wearing no shirt number at all
 * is not a thing this is for.
 */
function LineupPicker({
  name,
  accent,
  players,
  saved,
  savedNumbers,
  onSave,
}: {
  name: string
  accent: string
  players: Player[]
  saved: string[]
  savedNumbers?: Record<string, number>
  onSave: (playerIds: string[], numbers: Record<string, number>) => Promise<void>
}) {
  const [chosen, setChosen] = useState<string[]>(saved)
  const [numbers, setNumbers] = useState<Record<string, number>>(savedNumbers ?? {})
  const [error, setError] = useState<string | null>(null)

  // The stored list is the truth. Re-syncing on its contents rather than its
  // identity keeps a save made elsewhere from being reverted by a re-render,
  // without fighting the tick the person just made here.
  useEffect(() => {
    setChosen(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.join(',')])

  // The same rule for the numbers, and by their contents for the same reason:
  // the map is rebuilt on every render of the page above, so its identity says
  // nothing about whether anything changed.
  const storedNumbers = JSON.stringify(savedNumbers ?? {})
  useEffect(() => {
    setNumbers(savedNumbers ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedNumbers])

  const save = async (nextChosen: string[], nextNumbers: Record<string, number>) => {
    const wasChosen = chosen
    const wasNumbers = numbers

    setChosen(nextChosen)
    setNumbers(nextNumbers)
    setError(null)
    try {
      await onSave(nextChosen, nextNumbers)
    } catch (caught) {
      setChosen(wasChosen)
      setNumbers(wasNumbers)
      setError(caught instanceof Error && caught.message ? caught.message : 'That could not be saved.')
    }
  }

  const toggle = (playerId: string) => {
    const on = chosen.includes(playerId)
    const nextChosen = on ? chosen.filter((id) => id !== playerId) : [...chosen, playerId]

    // A number belongs to somebody on the sheet, so taking a player off takes
    // their number with them. The server cuts it either way; doing it here as
    // well keeps the box from reappearing with a number nobody stored.
    const nextNumbers = { ...numbers }
    if (on) delete nextNumbers[playerId]

    return save(nextChosen, nextNumbers)
  }

  const setNumber = (player: Player, entered: string) => {
    const next = { ...numbers }
    const typed = entered.trim()
    const value = Number(typed)
    const override =
      typed !== '' && Number.isInteger(value) && value >= 0 && value <= 99 && value !== player.number

    if (override) {
      if (next[player.id] === value) return
      next[player.id] = value
    } else {
      // Empty, out of range, or the club's own number: there is nothing to
      // override, and storing the club number would pin a copy of it that a
      // later renumbering could not move.
      if (!(player.id in next)) return
      delete next[player.id]
    }

    return save(chosen, next)
  }

  // Two players in the same shirt is allowed — a teamsheet filled in after the
  // whistle is a record of what happened, and refusing it would refuse the
  // record — so the screen says so rather than the server.
  const worn = new Map<string, number>()
  for (const player of players) {
    if (!chosen.includes(player.id)) continue
    const shirt = numberInMatch(player, numbers)
    if (typeof shirt === 'number') worn.set(player.id, shirt)
  }
  const shared = new Set(
    [...worn.values()].filter((shirt, index, all) => all.indexOf(shirt) !== index),
  )

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
              const shirt = worn.get(player.id)
              const clash = typeof shirt === 'number' && shared.has(shirt)
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-2 p-2 glass rounded"
                >
                  {/* The label covers the tick and the name only. An input
                      inside it would toggle the checkbox on every click. */}
                  <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(player.id)}
                      className="w-4 h-4 shrink-0 rounded border border-white/20"
                    />
                    <span className="text-sm truncate">
                      {player.firstName} {player.lastName}
                    </span>
                    {player.position && (
                      <span className="text-xs opacity-70 shrink-0">({player.position})</span>
                    )}
                  </label>

                  {on ? (
                    <InlineInput
                      type="number"
                      min={0}
                      max={99}
                      value={typeof shirt === 'number' ? shirt : ''}
                      onCommit={(entered) => setNumber(player, entered)}
                      aria-label={`Shirt number for ${player.firstName} ${player.lastName} in this match`}
                      title="The shirt worn in this match. Clear it to go back to the club number."
                      className={`w-16 shrink-0 px-2 py-1 rounded bg-transparent border text-sm text-center tabular-nums focus:outline-none ${
                        clash
                          ? 'border-amber-400/70 text-amber-300'
                          : 'border-white/20 focus:border-white/40'
                      }`}
                    />
                  ) : (
                    <span className="w-16 shrink-0 text-xs opacity-50 text-center tabular-nums">
                      {player.number ?? ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-sm opacity-70">Selected: {chosen.length} players</div>
          {shared.size > 0 && (
            <p className="text-sm text-amber-300 mt-2">
              {shared.size === 1
                ? 'Two players are down to wear the same number in this match.'
                : 'Some numbers are worn by more than one player in this match.'}
            </p>
          )}
          {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
        </>
      )}
    </div>
  )
}
