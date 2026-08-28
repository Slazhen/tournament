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
  IconClipboard,
} from '../components/icons'
import { playersForPicking, registeredPlayers } from '../utils/squads'
import { youtubeEmbedUrl } from '../utils/video'

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
  const match = tournament?.matches.find(m => m.id === matchId)
  
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
    updateMatch({ goals })
  }

  const deleteGoal = (goalId: string) => {
    const goals = match.goals?.filter(g => g.id !== goalId) || []
    updateMatch({ goals })
  }

  const removeGoal = (goalId: string) => {
    const goals = match.goals?.filter(g => g.id !== goalId) || []
    updateMatch({ goals })
    
    // Update score
    const homeGoals = goals.filter(g => g.team === 'home').length
    const awayGoals = goals.filter(g => g.team === 'away').length
    updateMatch({ homeGoals, awayGoals })
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
            {tournament.name} • Round {match.round || 1}
            {match.isPlayoff && ` • Playoff Round ${match.playoffRound}`}
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
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: homeTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{homeTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <div className="text-lg font-semibold">{homeTeam.name}</div>
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
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: awayTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{awayTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <div className="text-lg font-semibold">{awayTeam.name}</div>
              <div className="text-4xl font-bold text-red-400">
                {typeof match.awayGoals === 'number' ? match.awayGoals : '-'}
              </div>
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
                    { label: 'Goals', home: match.homeGoals || 0, away: match.awayGoals || 0 },
                    { label: 'Shots', home: match.statistics?.home.shots || 0, away: match.statistics?.away.shots || 0 },
                    { label: 'Shots on Target', home: match.statistics?.home.shotsOnTarget || 0, away: match.statistics?.away.shotsOnTarget || 0 },
                    { label: 'Corners', home: match.statistics?.home.corners || 0, away: match.statistics?.away.corners || 0 },
                    { label: 'Fouls', home: match.statistics?.home.fouls || 0, away: match.statistics?.away.fouls || 0 },
                    { label: 'Yellow Cards', home: match.statistics?.home.yellowCards || 0, away: match.statistics?.away.yellowCards || 0 },
                    { label: 'Red Cards', home: match.statistics?.home.redCards || 0, away: match.statistics?.away.redCards || 0 },
                    { label: 'Possession', home: `${match.statistics?.home.possession || 50}%`, away: `${match.statistics?.away.possession || 50}%` }
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
                        onClick={() => removeGoal(goal.id)}
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
                  {[
                    { label: 'Goals', home: 'goals', away: 'goals' },
                    { label: 'Shots', home: 'shots', away: 'shots' },
                    { label: 'Shots on Target', home: 'shotsOnTarget', away: 'shotsOnTarget' },
                    { label: 'Corners', home: 'corners', away: 'corners' },
                    { label: 'Fouls', home: 'fouls', away: 'fouls' },
                    { label: 'Yellow Cards', home: 'yellowCards', away: 'yellowCards' },
                    { label: 'Red Cards', home: 'redCards', away: 'redCards' },
                    { label: 'Possession', home: 'possession', away: 'possession', suffix: '%' }
                  ].map(stat => (
                    <tr key={stat.label} className="border-b border-white/10">
                      <td className="py-3 px-4 font-medium">{stat.label}</td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          value={stat.label === 'Goals' 
                            ? (match.homeGoals || '')
                            : (match.statistics?.home[stat.home as keyof typeof match.statistics.home] || '')
                          }
                          onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : undefined
                            if (stat.label === 'Goals') {
                              updateMatch({ homeGoals: value })
                            } else {
                              updateMatch({
                                statistics: {
                                  home: { ...match.statistics?.home, [stat.home]: value },
                                  away: { ...match.statistics?.away }
                                }
                              })
                            }
                          }}
                          className="w-20 px-2 py-1 rounded bg-transparent border border-white/20 text-center text-sm focus:border-white/40 focus:outline-none"
                        />
                        <span className="text-sm ml-1">{stat.suffix || ''}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          value={stat.label === 'Goals' 
                            ? (match.awayGoals || '')
                            : (match.statistics?.away[stat.away as keyof typeof match.statistics.away] || '')
                          }
                          onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : undefined
                            if (stat.label === 'Goals') {
                              updateMatch({ awayGoals: value })
                            } else {
                              updateMatch({
                                statistics: {
                                  home: { ...match.statistics?.home },
                                  away: { ...match.statistics?.away, [stat.away]: value }
                                }
                              })
                            }
                          }}
                          className="w-20 px-2 py-1 rounded bg-transparent border border-white/20 text-center text-sm focus:border-white/40 focus:outline-none"
                        />
                        <span className="text-sm ml-1">{stat.suffix || ''}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
