import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useEffect, useState } from 'react'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'

export default function PublicTournamentPage() {
  const { id, tournamentId } = useParams()
  const { getAllTournaments, getAllTeams, loadTournaments, loadTeams } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [playerStatsFilter, setPlayerStatsFilter] = useState<'all' | 'scorers' | 'assists'>('scorers')
  
  // Handle both old and new URL structures
  const actualTournamentId = tournamentId || id

  // Load data from AWS when component mounts
  useEffect(() => {
    const loadData = async () => {
      try {
        // Check if data is already available in store before loading
        const existingTournaments = getAllTournaments()
        const existingTeams = getAllTeams()
        
        // Only load if we don't have data
        if (existingTournaments.length === 0 || existingTeams.length === 0) {
          await Promise.all([loadTournaments(), loadTeams()])
        }
        setDataLoaded(true)
      } catch (error) {
        console.error('Error loading data for public tournament page:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [loadTournaments, loadTeams, getAllTournaments, getAllTeams])
    
  // Reload data when page becomes visible (handles tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadTournaments().catch(console.error)
        loadTeams().catch(console.error)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadTournaments, loadTeams, getAllTournaments, getAllTeams])

  if (isLoading || !dataLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
          <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-white/20 animate-pulse">
              <span className="text-3xl">🏆</span>
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Loading Tournament
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Please wait while we load the tournament data...</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-400"></div>
          </div>
        </div>
      </div>
    )
  }

  // Only access data after it's loaded with error handling
  let tournaments: any[] = []
  let teams: any[] = []
  let tournament: any = null
  
  try {
    tournaments = getAllTournaments() || []
    teams = getAllTeams() || []
    
    // Find the specific tournament by ID
    tournament = tournaments.find(t => t && t.id === actualTournamentId)
  } catch (error) {
    console.error('Error accessing data in PublicTournamentPage:', error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Error Loading Data</h1>
          <p className="text-lg opacity-80 text-gray-300 mb-6">There was an error loading the tournament data. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 text-white font-medium border border-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-white/5"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }
  
  // Show tournament not found if it doesn't exist
  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center border border-white/20">
              <span className="text-3xl">🏆</span>
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Tournament Not Found
            </h1>
            <p className="text-lg opacity-80 text-gray-300 mb-6">The tournament you're looking for doesn't exist.</p>
          </div>
          <Link 
            to="/" 
            className="inline-block px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 text-white font-medium border border-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-white/5"
          >
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  // Helper function to get all matches including custom playoff matches
  const getAllMatches = () => {
    let allMatches = [...(tournament.matches || [])]
    
    // Add custom playoff matches if they exist
    if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
      tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any) => {
            allMatches.push({
              ...match,
              isPlayoff: true,
              playoffRound: round.name
            })
          })
        }
      })
    }
    
    return allMatches
  }

  const calculateTable = () => {
    if (!tournament) return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    
    // Check if this is a groups_with_divisions format - EXACTLY like admin page
    if (tournament.format?.mode === 'groups_with_divisions' && tournament.format?.groupsWithDivisionsConfig) {
      let groups = tournament.format.groupsWithDivisionsConfig.groups
      
      // If groups aren't stored, reconstruct them from matches
      if (!groups || groups.length === 0) {
        const config = tournament.format.groupsWithDivisionsConfig
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // Reconstruct groups from match groupIndex
        const reconstructedGroups: Record<number, Set<string>> = {}
        tournament.matches.forEach((m: any) => {
          if (!m.isPlayoff && m.groupIndex) {
            if (!reconstructedGroups[m.groupIndex]) {
              reconstructedGroups[m.groupIndex] = new Set()
            }
            reconstructedGroups[m.groupIndex].add(m.homeTeamId)
            reconstructedGroups[m.groupIndex].add(m.awayTeamId)
          }
        })
        
        // Convert to array format
        groups = []
        for (let i = 1; i <= numberOfGroups; i++) {
          if (reconstructedGroups[i]) {
            groups.push(Array.from(reconstructedGroups[i]))
          } else {
            // Fallback: distribute teams evenly
            const startIdx = (i - 1) * teamsPerGroup
            const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
            groups.push(tournament.teamIds.slice(startIdx, endIdx))
          }
        }
      }
      
      if (groups && groups.length > 0) {
        const groupTables: Record<number, any[]> = {}
      
        // Calculate standings for each group separately - EXACTLY like admin page
        groups.forEach((groupTeams: string[], groupIndex: number) => {
          const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
          
          // Initialize stats for teams in this group
          groupTeams.forEach((tid: string) => {
            stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
          })
          
          // Count group matches (matches with this groupIndex)
          const groupMatches = tournament.matches.filter((m: any) => 
            !m.isPlayoff && m.groupIndex === groupIndex + 1 &&
            groupTeams.includes(m.homeTeamId) && groupTeams.includes(m.awayTeamId)
          )
          
          for (const m of groupMatches) {
            if (!m || (m as any).homeGoals == null || (m as any).awayGoals == null) continue
            const a = stats[(m as any).homeTeamId]
            const b = stats[(m as any).awayTeamId]
            if (!a || !b) continue
            
            a.p++; b.p++
            a.gf += (m as any).homeGoals; a.ga += (m as any).awayGoals
            b.gf += (m as any).awayGoals; b.ga += (m as any).homeGoals
            if ((m as any).homeGoals > (m as any).awayGoals) { a.w++; b.l++; a.pts += 3 }
            else if ((m as any).homeGoals < (m as any).awayGoals) { b.w++; a.l++; b.pts += 3 }
            else { a.d++; b.d++; a.pts++; b.pts++ }
          }
          
          const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
            .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
          
          groupTables[groupIndex + 1] = table
        })
      
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
    }
    
    // Regular league/playoff table calculation
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    const eliminatedTeams = new Set<string>()
    
    // Initialize stats for all teams
    teams.forEach((team: any) => {
      if (team.id) {
        stats[team.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
      }
    })

    // Process all matches (including custom playoff matches)
    const allMatches = getAllMatches()
    allMatches.forEach((match: any) => {
      // Only process matches that have been played (both scores are valid numbers)
      const hasValidScores = typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number' &&
                           !isNaN(match.homeGoals) && !isNaN(match.awayGoals) &&
                           match.homeGoals >= 0 && match.awayGoals >= 0
      
      if (hasValidScores) {
        const homeTeam = stats[match.homeTeamId]
        const awayTeam = stats[match.awayTeamId]
        
        if (homeTeam && awayTeam) {
          homeTeam.p++
          awayTeam.p++
          homeTeam.gf += match.homeGoals
          homeTeam.ga += match.awayGoals
          awayTeam.gf += match.awayGoals
          awayTeam.ga += match.homeGoals

          if (match.homeGoals > match.awayGoals) {
            homeTeam.w++
            awayTeam.l++
            homeTeam.pts += 3
          } else if (match.homeGoals < match.awayGoals) {
            awayTeam.w++
            homeTeam.l++
            awayTeam.pts += 3
          } else {
            homeTeam.d++
            awayTeam.d++
            homeTeam.pts++
            awayTeam.pts++
          }
        }
      }
    })
    
    // Handle elimination matches
    if (tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') {
      tournament.matches.forEach((match: any) => {
        if (match.isPlayoff && ((match as any).homeGoals != null || (match as any).awayGoals != null)) {
          const homeTeamId = match.homeTeamId
          const awayTeamId = match.awayTeamId
          
          if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return
          
          // Mark the loser as eliminated
          if ((match as any).homeGoals > (match as any).awayGoals) {
            eliminatedTeams.add(awayTeamId)
          } else if ((match as any).homeGoals < (match as any).awayGoals) {
            eliminatedTeams.add(homeTeamId)
          }
        }
      })
    }
    
    const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
    
    return { table, eliminatedTeams, groupTables: {} }
  }

  // Calculate table directly without useMemo to avoid infinite loops
  const { table, eliminatedTeams, groupTables } = calculateTable()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="glass rounded-2xl p-8 max-w-4xl mx-auto shadow-2xl border border-white/20">
            {tournament.logo && (
              <div className="mb-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full blur-2xl opacity-30 bg-gradient-to-r from-blue-400/20 to-purple-400/20"></div>
                  <div className="relative bg-white/10 backdrop-blur-sm rounded-full p-6 border border-white/20 shadow-xl">
                    <img 
                      src={tournament.logo} 
                      alt={`${tournament.name} logo`}
                      className="w-24 h-24 object-contain"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {tournament.name}
            </h1>
            
            {/* Tournament Info */}
            <div className="space-y-4 mb-8">
              {tournament.location?.name && (
                <div className="flex items-center justify-center gap-2 text-lg sm:text-xl text-gray-300">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span>📍 {tournament.location.name}</span>
                </div>
              )}
              
              {/* Social Media Links */}
              {(tournament.socialMedia?.facebook || tournament.socialMedia?.instagram) && (
                <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                  {tournament.socialMedia?.facebook && (
                    <a 
                      href={tournament.socialMedia.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center gap-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30 hover:border-blue-400/50 px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all backdrop-blur-sm"
                    >
                      <FacebookIcon size={24} className="group-hover:scale-110 transition-transform" />
                      <span className="text-white font-medium text-sm sm:text-base">Facebook</span>
                    </a>
                  )}
                  {tournament.socialMedia?.instagram && (
                    <a 
                      href={tournament.socialMedia.instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center gap-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-400/30 hover:border-pink-400/50 px-4 sm:px-6 py-2 sm:py-3 rounded-xl transition-all backdrop-blur-sm"
                    >
                      <InstagramIcon size={24} className="group-hover:scale-110 transition-transform" />
                      <span className="text-white font-medium text-sm sm:text-base">Instagram</span>
                    </a>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-center gap-6 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>{teams.length} Teams</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>{getAllMatches().length} Matches</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Standings - Groups or Regular Table */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Standings</h2>
            <p className="text-gray-400 text-sm sm:text-base">Current tournament rankings</p>
          </div>
          
          {/* Group Tables */}
          {tournament.format?.mode === 'groups_with_divisions' && (tournament.format?.groupsWithDivisionsConfig?.groups || tournament.format?.groupsWithDivisionsConfig) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {(() => {
                // Get groups from config or reconstruct from groupTables
                let groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
                
                // If no groups but we have groupTables, create groups from groupTables
                if (groups.length === 0 && Object.keys(groupTables).length > 0) {
                  const config = tournament.format?.groupsWithDivisionsConfig
                  const numberOfGroups = config?.numberOfGroups || Object.keys(groupTables).length
                  
                  groups = []
                  for (let i = 1; i <= numberOfGroups; i++) {
                    const groupTable = (groupTables as Record<number, any[]>)[i] || []
                    const teamIds = groupTable.map((row: any) => row.id)
                    if (teamIds.length > 0) {
                      groups.push(teamIds)
                    }
                  }
                }
                
                // If still no groups, create from teamIds based on config
                if (groups.length === 0) {
                  const config = tournament.format?.groupsWithDivisionsConfig
                  const numberOfGroups = config?.numberOfGroups || 4
                  const teamsPerGroup = config?.teamsPerGroup || 4
                  
                  for (let i = 0; i < numberOfGroups; i++) {
                    const startIdx = i * teamsPerGroup
                    const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
                    groups.push(tournament.teamIds.slice(startIdx, endIdx))
                  }
                }
                
                return groups.map((_groupTeams: string[], groupIndex: number) => {
                  const groupTable = (groupTables as Record<number, any[]>)[groupIndex + 1] || []
                  const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
                  
                  return (
                    <div key={groupIndex} className="glass rounded-2xl p-4 sm:p-8 overflow-hidden shadow-2xl border border-white/20">
                      <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 text-center">Group {groupLetter}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-base">
                          <thead>
                            <tr className="border-b border-white/20">
                              <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">#</th>
                              <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Team</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">P</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">W</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">D</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">L</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GF</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GA</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GD</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupTable.map((row: any, index: number) => {
                              const team = teams.find((t: any) => t.id === row.id)
                              const isTop2 = index < 2
                              const isTop4 = index < 4
                              return (
                                <tr 
                                  key={row.id} 
                                  className={`border-b border-white/10 hover:bg-white/5 transition-all duration-300 ${isTop2 ? 'bg-gradient-to-r from-green-500/5 to-green-500/10' : isTop4 ? 'bg-gradient-to-r from-blue-500/5 to-blue-500/10' : ''}`}
                                >
                                  <td className="py-2 px-1 sm:px-6 text-white font-bold text-xs sm:text-lg">{index + 1}</td>
                                  <td className="py-2 px-1 sm:px-6">
                                    <Link 
                                      to={`/public/teams/${row.id}`}
                                      className="group flex items-center gap-1 sm:gap-4 hover:text-blue-300 transition-colors duration-300"
                                    >
                                      {team?.logo ? (
                                        <div className="relative">
                                          <img 
                                            src={team.logo} 
                                            alt={`${team.name} logo`}
                                            className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                          />
                                          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                          <span className="text-xs sm:text-base font-bold text-white">
                                            {team?.name?.charAt(0) || 'T'}
                                          </span>
                                        </div>
                                      )}
                                      <span className="font-medium text-xs sm:text-lg group-hover:text-blue-300 transition-colors duration-300">
                                        {team?.name || 'Unknown Team'}
                                      </span>
                                      {isTop2 && (
                                        <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full">
                                          Div 1
                                        </span>
                                      )}
                                      {index === 2 || index === 3 ? (
                                        <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                                          Div 2
                                        </span>
                                      ) : null}
                                    </Link>
                                  </td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.p}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.w}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.d}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.l}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.ga}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf - row.ga}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white font-bold text-xs sm:text-xl">{row.pts}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="text-center mt-4 text-xs sm:text-sm text-gray-400">
                        <p>Top 2 teams advance to Division 1 playoffs</p>
                        <p>3rd and 4th place go to Division 2 playoffs</p>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            /* Regular Standings Table */
            <div className="glass rounded-2xl p-4 sm:p-8 overflow-hidden shadow-2xl border border-white/20">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-base">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">#</th>
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Team</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">P</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">W</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">D</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">L</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GF</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GA</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GD</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((row: any, index: number) => {
                      const team = teams.find((t: any) => t.id === row.id)
                      const isTopThree = index < 3
                      const isEliminated = eliminatedTeams.has(row.id)
                      return (
                        <tr 
                          key={row.id} 
                          className={`border-b border-white/10 hover:bg-white/5 transition-all duration-300 ${isTopThree ? 'bg-gradient-to-r from-yellow-500/5 to-orange-500/5' : ''} ${isEliminated ? 'opacity-50' : ''}`}
                        >
                          <td className="py-2 px-1 sm:px-6 text-white font-bold text-xs sm:text-lg">
                            <div className="flex items-center gap-1 sm:gap-2">
                              {isTopThree && (
                                <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-black' : 
                                  index === 1 ? 'bg-gray-400 text-black' : 
                                  'bg-orange-500 text-black'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              {!isTopThree && <span className="text-xs sm:text-base">{index + 1}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-1 sm:px-6">
                            <Link 
                              to={`/public/teams/${row.id}`}
                              className="group flex items-center gap-1 sm:gap-4 hover:text-blue-300 transition-colors duration-300"
                            >
                              {team?.logo ? (
                                <div className="relative">
                                  <img 
                                    src={team.logo} 
                                    alt={`${team.name} logo`}
                                    className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                  />
                                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                </div>
                              ) : (
                                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                  <span className="text-xs sm:text-base font-bold text-white">
                                    {team?.name?.charAt(0) || 'T'}
                                  </span>
                                </div>
                              )}
                              <span className="font-medium text-xs sm:text-lg group-hover:text-blue-300 transition-colors duration-300">
                                {team?.name || 'Unknown Team'}
                              </span>
                              {isEliminated && (
                                <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full">
                                  Eliminated
                                </span>
                              )}
                            </Link>
                          </td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.p}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.w}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.d}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.l}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.ga}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf - row.ga}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white font-bold text-xs sm:text-xl">{row.pts}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Statistics</h2>
            <p className="text-gray-400 text-sm sm:text-base">Player performance analytics</p>
          </div>
          
          {/* Player Statistics */}
          <div className="glass rounded-2xl p-4 sm:p-8 shadow-2xl border border-white/20">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <h3 className="text-xl sm:text-2xl font-bold text-white">Player Performance</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlayerStatsFilter('all')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'all'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    All Players
                  </button>
                  <button
                    onClick={() => setPlayerStatsFilter('scorers')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'scorers'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    Top Scorers
                  </button>
                  <button
                    onClick={() => setPlayerStatsFilter('assists')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'assists'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    Top Assists
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-base">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Player</th>
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Club</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Goals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Calculate player statistics
                      const playerStats = teams.flatMap((team: any) => 
                        (team.players || []).map((player: any) => {
                          const playerMatches = tournament.matches?.filter((match: any) => {
                            const isHome = match.homeTeamId === team.id
                            const teamPlayers = isHome ? match.lineups?.home?.starting || [] : match.lineups?.away?.starting || []
                            return teamPlayers.includes(player.id) && match.homeGoals !== null && match.awayGoals !== null
                          }) || []
                          
                          let goals = 0
                          let assists = 0
                          
                          tournament.matches?.forEach((match: any) => {
                            if (match.goals) {
                              match.goals.forEach((goal: any) => {
                                if (goal.playerId === player.id) goals++
                                if (goal.assistPlayerId === player.id) assists++
                              })
                            }
                          })
                          
                          return {
                            player,
                            team,
                            gamesPlayed: playerMatches.length,
                            goals,
                            assists
                          }
                        })
                      )
                      
                      // Filter and sort based on selected filter
                      let filteredStats = playerStats
                      if (playerStatsFilter === 'scorers') {
                        filteredStats = playerStats.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5)
                      } else if (playerStatsFilter === 'assists') {
                        filteredStats = playerStats.filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 5)
                      } else {
                        // Sort by goals first, then assists
                        filteredStats = playerStats.sort((a, b) => {
                          if (b.goals !== a.goals) return b.goals - a.goals
                          return b.assists - a.assists
                        })
                      }
                      
                      return filteredStats.map((stats) => (
                        <tr key={`${stats.team.id}-${stats.player.id}`} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                          <td className="py-2 px-1 sm:px-6">
                            <div className="flex items-center gap-1 sm:gap-3">
                              {stats.player.photo ? (
                                <img 
                                  src={stats.player.photo} 
                                  alt={`${stats.player.firstName} ${stats.player.lastName}`}
                                  className="w-6 h-6 sm:w-10 sm:h-10 rounded-full object-cover border border-white/20"
                                />
                              ) : (
                                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                                  <span className="text-xs font-bold text-white">
                                    {stats.player.firstName.charAt(0)}{stats.player.lastName.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <div>
                                <div className="text-white font-semibold text-xs sm:text-lg">
                                  {stats.player.firstName} {stats.player.lastName}
                                </div>
                                {stats.player.number && (
                                  <div className="text-xs text-gray-400">#{stats.player.number}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-1 sm:px-6">
                            <div className="flex items-center gap-1 sm:gap-2">
                              {stats.team.logo ? (
                                <img 
                                  src={stats.team.logo} 
                                  alt={`${stats.team.name} logo`}
                                  className="w-6 h-6 sm:w-10 sm:h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center">
                                  <span className="text-xs font-bold text-white">
                                    {stats.team.name.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <span className="text-white font-medium text-xs sm:text-lg">{stats.team.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white font-semibold">
                            <span className="text-yellow-400 font-bold text-xs sm:text-base">{stats.goals}</span>
                          </td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Matches by Rounds */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Fixtures & Results</h2>
            <p className="text-gray-400 text-sm sm:text-base">Matches organized by rounds</p>
          </div>
          
          {(() => {
            // Group matches by round (only non-playoff matches)
            const matchesByRound: Record<number, any[]> = {}
            tournament.matches?.forEach((match: any) => {
              if (!match.isPlayoff) {
                const round = match.round || 0
                if (!matchesByRound[round]) {
                  matchesByRound[round] = []
                }
                matchesByRound[round].push(match)
              }
            })
            
            // Sort rounds
            const sortedRounds = Object.keys(matchesByRound)
              .map(Number)
              .sort((a, b) => a - b)
            
            return sortedRounds.map(roundNumber => {
              const roundMatches = matchesByRound[roundNumber]
              
              return (
                <div key={roundNumber} className="mb-6 sm:mb-8">
                  <div className="glass rounded-2xl p-3 sm:p-6 shadow-2xl border border-white/20">
                    {/* Round Header */}
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-white/20">
                          <span className="text-sm sm:text-xl font-bold text-white">{roundNumber + 1}</span>
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-2xl font-bold text-white">Tour {roundNumber + 1}</h3>
                          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-400">
                            <span>{roundMatches.length} matches</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Matches Grid */}
                    <div className="grid gap-2 sm:gap-4">
                      {roundMatches.map((match) => {
                        const homeTeam = teams.find((t: any) => t.id === match.homeTeamId)
                        const awayTeam = teams.find((t: any) => t.id === match.awayTeamId)
                        const isMatchFinished = match.homeGoals !== null && match.awayGoals !== null
                        const isMatchUpcoming = match.homeGoals === null && match.awayGoals === null
                        
                        return (
                          <div key={match.id} className={`group relative bg-white/5 backdrop-blur-sm rounded-xl p-3 sm:p-6 hover:bg-white/10 transition-all duration-300 border ${
                            isMatchFinished ? 'border-green-500/20' : 
                            isMatchUpcoming ? 'border-blue-500/20' : 
                            'border-yellow-500/20'
                          }`}>
                            {/* Match Status Indicator */}
                            <div className="absolute top-2 right-2 sm:top-4 sm:right-4">
                              <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${
                                isMatchFinished ? 'bg-green-400' : 
                                isMatchUpcoming ? 'bg-blue-400' : 
                                'bg-yellow-400 animate-pulse'
                              }`}></div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              {/* Home Team */}
                              <div className="flex items-center gap-2 sm:gap-4 flex-1">
                                {homeTeam?.logo ? (
                                  <div className="relative">
                                    <img 
                                      src={homeTeam.logo} 
                                      alt={`${homeTeam.name} logo`}
                                      className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                    />
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                    <span className="text-sm sm:text-lg font-bold text-white">
                                      {homeTeam?.name?.charAt(0) || 'H'}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <Link 
                                    to={`/public/teams/${match.homeTeamId}`}
                                    className="text-white font-semibold text-sm sm:text-lg group-hover:text-blue-300 transition-colors duration-300"
                                  >
                                    {homeTeam?.name || 'Unknown Team'}
                                  </Link>
                                </div>
                              </div>
                              
                              {/* Score/VS */}
                              <div className="text-center px-2 sm:px-6">
                                {isMatchFinished ? (
                                  <div className="space-y-1 sm:space-y-2">
                                    <div className="text-xl sm:text-3xl font-bold text-white">
                                      {match.homeGoals} - {match.awayGoals}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1 sm:space-y-2">
                                    <div className="text-sm sm:text-xl font-semibold text-gray-300">vs</div>
                                    <div className="text-xs text-blue-400 font-medium">
                                      {isMatchUpcoming ? 'UPCOMING' : 'LIVE'}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Match Date & Time */}
                                {match.dateISO && (
                                  <div className="text-xs sm:text-sm text-gray-400 mt-1 sm:mt-2">
                                    <div>
                                      {new Date(match.dateISO).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric'
                                      })}
                                    </div>
                                    <div>
                                      {new Date(match.dateISO).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: false
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Away Team */}
                              <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end">
                                <div className="text-right">
                                  <Link 
                                    to={`/public/teams/${match.awayTeamId}`}
                                    className="text-white font-semibold text-sm sm:text-lg group-hover:text-blue-300 transition-colors duration-300"
                                  >
                                    {awayTeam?.name || 'Unknown Team'}
                                  </Link>
                                </div>
                                {awayTeam?.logo ? (
                                  <div className="relative">
                                    <img 
                                      src={awayTeam.logo} 
                                      alt={`${awayTeam.name} logo`}
                                      className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                    />
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                    <span className="text-sm sm:text-lg font-bold text-white">
                                      {awayTeam?.name?.charAt(0) || 'A'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>

        {/* Playoff Bracket Section */}
        {(() => {
          // Check if tournament has custom playoff configuration
          const hasCustomPlayoff = tournament.format?.mode === 'league_custom_playoff' && 
                                  tournament.format?.customPlayoffConfig?.playoffRounds?.length > 0
          
          return hasCustomPlayoff
        })() && (
          <div className="mb-12">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Playoff Bracket</h2>
              <p className="text-gray-400 text-sm sm:text-base">Tournament playoffs</p>
            </div>
            
            <div className="space-y-6">
              {tournament.format.customPlayoffConfig.playoffRounds.map((round: any, roundIndex: number) => (
                <div key={roundIndex} className="glass rounded-2xl p-4 sm:p-6 shadow-2xl border border-white/20">
                  <div className="text-center mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-2xl font-bold text-white mb-2">
                      {round.name}
                    </h3>
                    {round.description && (
                      <p className="text-sm sm:text-base text-gray-400">{round.description}</p>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    {round.matches && round.matches.length > 0 ? (
                      round.matches.map((match: any) => {
                        const homeTeam = teams.find((t: any) => t.id === match.homeTeamId)
                        const awayTeam = teams.find((t: any) => t.id === match.awayTeamId)
                        
                        return (
                          <div key={match.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {homeTeam?.logo ? (
                                  <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                    <span className="text-xs">{homeTeam?.name?.charAt(0) || 'H'}</span>
                                  </div>
                                )}
                                <Link to={`/public/teams/${match.homeTeamId}`} className="text-white font-medium hover:text-blue-300">
                                  {homeTeam?.name || match.homeTeamId}
                                </Link>
                              </div>
                              
                              <div className="px-4">
                                {match.homeGoals != null && match.awayGoals != null ? (
                                  <span className="text-xl font-bold text-white">{match.homeGoals} - {match.awayGoals}</span>
                                ) : (
                                  <span className="text-gray-400">vs</span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3 flex-1 justify-end">
                                <Link to={`/public/teams/${match.awayTeamId}`} className="text-white font-medium hover:text-blue-300">
                                  {awayTeam?.name || match.awayTeamId}
                                </Link>
                                {awayTeam?.logo ? (
                                  <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                    <span className="text-xs">{awayTeam?.name?.charAt(0) || 'A'}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-center text-gray-400">No matches scheduled yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
