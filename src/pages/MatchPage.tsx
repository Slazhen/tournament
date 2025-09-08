import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useState } from 'react'
import { uid } from '../utils/uid'

export default function MatchPage() {
  const { tournamentId, matchId } = useParams()
  const { getCurrentOrganizer, getOrganizerTeams, getOrganizerTournaments, updateTournament } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()

  const tournament = tournaments.find(t => t.id === tournamentId)
  const match = tournament?.matches.find(m => m.id === matchId)
  
  const homeTeam = teams.find(t => t.id === match?.homeTeamId)
  const awayTeam = teams.find(t => t.id === match?.awayTeamId)

  const [activeTab, setActiveTab] = useState<'overview' | 'statistics' | 'lineups' | 'goals' | 'content'>('overview')

  if (!currentOrganizer) {
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

  const updateMatch = (updates: Partial<typeof match>) => {
    if (!tournament) return
    const updatedMatches = tournament.matches.map(m => 
      m.id === matchId ? { ...m, ...updates } : m
    )
    updateTournament(tournament.id, { matches: updatedMatches })
  }

  const addGoal = (team: 'home' | 'away', playerId: string, minute: number, type: 'goal' | 'penalty' | 'own_goal' = 'goal', assistPlayerId?: string) => {
    const newGoal = {
      id: uid(),
      team,
      playerId,
      minute,
      type,
      assistPlayerId,
      goalNumber: (match.goals?.filter(g => g.team === team).length || 0) + 1
    }
    const goals = [...(match.goals || []), newGoal]
    updateMatch({ goals })
    
    // Update score
    const homeGoals = goals.filter(g => g.team === 'home').length
    const awayGoals = goals.filter(g => g.team === 'away').length
    updateMatch({ homeGoals, awayGoals })
  }

  const updateGoal = (goalId: string, updates: Partial<{ minute: number; playerId: string; assistPlayerId?: string; type: 'goal' | 'penalty' | 'own_goal' }>) => {
    if (!goalId) {
      // Create new goal if no ID provided
      const team = updates.playerId && homeTeam.players.find(p => p.id === updates.playerId) ? 'home' : 'away'
      const goalNumber = (match.goals?.filter(g => g.team === team).length || 0) + 1
      const newGoal = {
        id: uid(),
        team,
        playerId: updates.playerId || '',
        minute: updates.minute || 0,
        type: updates.type || 'goal',
        assistPlayerId: updates.assistPlayerId,
        goalNumber
      }
      const goals = [...(match.goals || []), newGoal]
      updateMatch({ goals })
      
      // Update score
      const homeGoals = goals.filter(g => g.team === 'home').length
      const awayGoals = goals.filter(g => g.team === 'away').length
      updateMatch({ homeGoals, awayGoals })
      return
    }

    const goals = match.goals?.map(g => 
      g.id === goalId ? { ...g, ...updates } : g
    ) || []
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
    if (match.homeGoals !== undefined && match.awayGoals !== undefined) return 'finished'
    return 'live'
  }

  const matchStatus = getMatchStatus()

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link to={`/tournaments/${tournament.id}`} className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2">
            ← Back to {tournament.name}
          </Link>
        
          {/* Public Link */}
          <div className="text-center">
            <label className="block text-sm font-medium mb-2">Public Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/public/tournaments/${tournament.id}/matches/${match.id}`}
                className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-center min-w-[300px] text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/tournaments/${tournament.id}/matches/${match.id}`)}
                className="px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                title="Copy to clipboard"
              >
                📋 Copy
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
                    <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: homeTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{homeTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <div className="text-lg font-semibold">{homeTeam.name}</div>
              <div className="text-4xl font-bold text-blue-400">
                {match.homeGoals !== undefined ? match.homeGoals : '-'}
              </div>
            </div>
            
            <div className="text-2xl font-bold opacity-50">vs</div>
            
            <div className="text-center">
              {/* Away Team Logo */}
              <div className="flex justify-center mb-2">
                {awayTeam.logo ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                    <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: awayTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{awayTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <div className="text-lg font-semibold">{awayTeam.name}</div>
              <div className="text-4xl font-bold text-red-400">
                {match.awayGoals !== undefined ? match.awayGoals : '-'}
              </div>
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-center gap-6 text-sm">
            <div>
              <span className="opacity-70">Date:</span>
          <input
                type="datetime-local"
                value={match.dateISO ? new Date(match.dateISO).toISOString().slice(0, 16) : ''}
                onChange={(e) => updateMatch({ dateISO: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="ml-2 px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
              />
            </div>
            <div>
              <span className="opacity-70">Venue:</span>
          <input
                type="text"
                value={match.venue || ''}
                onChange={(e) => updateMatch({ venue: e.target.value || undefined })}
                placeholder="Enter venue"
                className="ml-2 px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
          />
        </div>
            <div>
              <span className="opacity-70">Referee:</span>
          <input
                type="text"
                value={match.referee || ''}
                onChange={(e) => updateMatch({ referee: e.target.value || undefined })}
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
          <div className="space-y-6">
            <h3 className="font-semibold mb-4">Team Lineups</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Home Team Lineup */}
              <div className="glass rounded-lg p-4">
                <h4 className="font-semibold mb-4 text-blue-400">{homeTeam.name}</h4>
                <div className="space-y-4">
                  <div>
                    <h5 className="text-sm font-medium mb-2 opacity-70">All Players</h5>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {homeTeam.players.map((player) => {
                        const isSelected = match.lineups?.home.starting.includes(player.id) || false
                        return (
                          <div key={player.id} className="flex items-center justify-between p-2 glass rounded">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentStarting = match.lineups?.home.starting || []
                                  let newStarting
                                  if (e.target.checked) {
                                    newStarting = [...currentStarting, player.id]
                                  } else {
                                    newStarting = currentStarting.filter(id => id !== player.id)
                                  }
                                  updateMatch({
                                    lineups: {
                                      home: { 
                                        starting: newStarting,
                                        substitutes: match.lineups?.home?.substitutes || []
                                      },
                                      away: {
                                        starting: match.lineups?.away?.starting || [],
                                        substitutes: match.lineups?.away?.substitutes || []
                                      }
                                    }
                                  })
                                }}
                                className="w-4 h-4 rounded border border-white/20"
                              />
                              <span className="text-sm">
                                {player.firstName} {player.lastName}
                              </span>
                              {player.number && (
                                <span className="text-xs opacity-70">#{player.number}</span>
                              )}
                              {player.position && (
                                <span className="text-xs opacity-70">({player.position})</span>
                              )}
                            </div>
                            {isSelected && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                                Selected
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 text-sm opacity-70">
                      Selected: {match.lineups?.home.starting.length || 0} players
                    </div>
                  </div>
            </div>
          </div>

              {/* Away Team Lineup */}
              <div className="glass rounded-lg p-4">
                <h4 className="font-semibold mb-4 text-red-400">{awayTeam.name}</h4>
                <div className="space-y-4">
                  <div>
                    <h5 className="text-sm font-medium mb-2 opacity-70">All Players</h5>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {awayTeam.players.map((player) => {
                        const isSelected = match.lineups?.away.starting.includes(player.id) || false
                        return (
                          <div key={player.id} className="flex items-center justify-between p-2 glass rounded">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentStarting = match.lineups?.away.starting || []
                                  let newStarting
                                  if (e.target.checked) {
                                    newStarting = [...currentStarting, player.id]
                                  } else {
                                    newStarting = currentStarting.filter(id => id !== player.id)
                                  }
                                  updateMatch({
                                    lineups: {
                                      home: {
                                        starting: match.lineups?.home?.starting || [],
                                        substitutes: match.lineups?.home?.substitutes || []
                                      },
                                      away: { 
                                        starting: newStarting,
                                        substitutes: match.lineups?.away?.substitutes || []
                                      }
                                    }
                                  })
                                }}
                                className="w-4 h-4 rounded border border-white/20"
                              />
                              <span className="text-sm">
                                {player.firstName} {player.lastName}
                              </span>
                              {player.number && (
                                <span className="text-xs opacity-70">#{player.number}</span>
                              )}
                              {player.position && (
                                <span className="text-xs opacity-70">({player.position})</span>
                              )}
                            </div>
                            {isSelected && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                                Selected
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 text-sm opacity-70">
                      Selected: {match.lineups?.away.starting.length || 0} players
                    </div>
                  </div>
                </div>
              </div>
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
            
            {/* Goal Entries Management */}
            <div className="space-y-6">
              {/* Home Team Goals */}
              {Array.from({ length: match.homeGoals || 0 }, (_, index) => {
                const goal = match.goals?.find(g => g.team === 'home' && g.goalNumber === index + 1)
                return (
                  <div key={`home-${index}`} className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-400/30">
                        <span className="text-blue-400 font-bold">{index + 1}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {homeTeam.logo && (
                          <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-8 h-8 rounded-full object-cover" />
                        )}
                        <span className="font-semibold text-blue-400">{homeTeam.name} Goal #{index + 1}</span>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Minute</label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={goal?.minute || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { minute: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                          placeholder="Minute"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Scorer</label>
                        <select
                          value={goal?.playerId || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { playerId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                        >
                          <option value="">Select Scorer</option>
                          {homeTeam.players.map(player => (
                            <option key={player.id} value={player.id}>
                              {player.firstName} {player.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Assist Provider</label>
                        <select
                          value={goal?.assistPlayerId || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { assistPlayerId: e.target.value || undefined })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                        >
                          <option value="">No Assist</option>
                          {homeTeam.players.map(player => (
                            <option key={player.id} value={player.id}>
                              {player.firstName} {player.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Type</label>
                        <select
                          value={goal?.type || 'goal'}
                          onChange={(e) => updateGoal(goal?.id || '', { type: e.target.value as 'goal' | 'penalty' | 'own_goal' })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                        >
                          <option value="goal">Goal</option>
                          <option value="penalty">Penalty</option>
                          <option value="own_goal">Own Goal</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {/* Away Team Goals */}
              {Array.from({ length: match.awayGoals || 0 }, (_, index) => {
                const goal = match.goals?.find(g => g.team === 'away' && g.goalNumber === index + 1)
                return (
                  <div key={`away-${index}`} className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center border border-red-400/30">
                        <span className="text-red-400 font-bold">{index + 1}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {awayTeam.logo && (
                          <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-8 h-8 rounded-full object-cover" />
                        )}
                        <span className="font-semibold text-red-400">{awayTeam.name} Goal #{index + 1}</span>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Minute</label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={goal?.minute || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { minute: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-all"
                          placeholder="Minute"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Scorer</label>
                        <select
                          value={goal?.playerId || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { playerId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-all"
                        >
                          <option value="">Select Scorer</option>
                          {awayTeam.players.map(player => (
                            <option key={player.id} value={player.id}>
                              {player.firstName} {player.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Assist Provider</label>
                        <select
                          value={goal?.assistPlayerId || ''}
                          onChange={(e) => updateGoal(goal?.id || '', { assistPlayerId: e.target.value || undefined })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-all"
                        >
                          <option value="">No Assist</option>
                          {awayTeam.players.map(player => (
                            <option key={player.id} value={player.id}>
                              {player.firstName} {player.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Type</label>
                        <select
                          value={goal?.type || 'goal'}
                          onChange={(e) => updateGoal(goal?.id || '', { type: e.target.value as 'goal' | 'penalty' | 'own_goal' })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-red-400/50 focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-all"
                        >
                          <option value="goal">Goal</option>
                          <option value="penalty">Penalty</option>
                          <option value="own_goal">Own Goal</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {/* No Goals Message */}
              {(!match.homeGoals || match.homeGoals === 0) && (!match.awayGoals || match.awayGoals === 0) && (
                <div className="glass rounded-xl p-8 text-center">
                  <div className="text-4xl mb-4">⚽</div>
                  <h4 className="font-semibold text-lg mb-2">No Goals Yet</h4>
                  <p className="text-gray-400">Update the match score to create goal entries</p>
                </div>
              )}
            </div>

            {/* Goals List */}
            {match.goals && match.goals.length > 0 && (
              <div>
                <h4 className="font-semibold mb-4">Goals Timeline</h4>
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

        {activeTab === 'content' && (
          <div className="space-y-6">
            <h3 className="font-semibold mb-4">Match Content</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Match Preview</label>
                <textarea
                  value={match.preview || ''}
                  onChange={(e) => updateMatch({ preview: e.target.value || undefined })}
                  placeholder="Enter match preview..."
                  rows={4}
                  className="w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Match Report</label>
                <textarea
                  value={match.report || ''}
                  onChange={(e) => updateMatch({ report: e.target.value || undefined })}
                  placeholder="Enter match report..."
                  rows={6}
                  className="w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                />
          </div>

              <div>
                <label className="block text-sm font-medium mb-2">Video URL</label>
                <input
                  type="url"
                  value={match.videoUrl || ''}
                  onChange={(e) => updateMatch({ videoUrl: e.target.value || undefined })}
                  placeholder="Enter video URL..."
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