import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo, useEffect, useState } from 'react'
import LocationIcon from '../components/LocationIcon'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'

export default function PublicTournamentPage() {
  const { id, orgName, tournamentId } = useParams()
  const { getAllTournaments, getAllTeams, loadTournaments, loadTeams } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  
  // Handle both old and new URL structures
  const actualTournamentId = tournamentId || id
  
  console.log('PublicTournamentPage: Component mounted', {
    id,
    orgName,
    tournamentId,
    actualTournamentId,
    windowLocation: window.location.href
  })

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
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="opacity-80">Loading tournament...</p>
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
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Error Loading Data</h1>
          <p className="opacity-80 mb-6">There was an error loading the tournament data. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all"
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
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament Not Found</h1>
          <p className="opacity-80 mb-6">The tournament you're looking for doesn't exist.</p>
          <div className="text-sm opacity-60 mb-4">
            <p>Looking for ID: {actualTournamentId}</p>
            <p>Available tournaments: {tournaments.length}</p>
            <p>Available teams: {teams.length}</p>
          </div>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const calculateTable = () => {
    if (!tournament) return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    
    // Debug logging
    console.log('🔍 PublicTournamentPage calculateTable - Tournament data:', {
      id: tournament.id,
      format: tournament.format,
      formatMode: tournament.format?.mode,
      hasGroupsConfig: !!tournament.format?.groupsWithDivisionsConfig,
      groupsConfig: tournament.format?.groupsWithDivisionsConfig,
      hasGroups: !!(tournament.format?.groupsWithDivisionsConfig?.groups && tournament.format.groupsWithDivisionsConfig.groups.length > 0),
      groups: tournament.format?.groupsWithDivisionsConfig?.groups,
      teamIdsCount: tournament.teamIds?.length,
      matchesCount: tournament.matches?.length,
      firstMatch: tournament.matches?.[0] ? {
        id: tournament.matches[0].id,
        groupIndex: tournament.matches[0].groupIndex,
        isPlayoff: tournament.matches[0].isPlayoff
      } : null
    })
    
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
      
      for (const tid of tournament.teamIds) {
        if (tid) {
          stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        }
      }
      
      // Count league matches for the table
    const leagueMatches = tournament.matches.filter((m: any) => !m.isPlayoff)
      
      for (const m of leagueMatches) {
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

  const { table, eliminatedTeams, groupTables } = useMemo(() => calculateTable(), [tournament])

  return (
    <div className="grid gap-6 place-items-center">
      <section className="glass rounded-xl p-6 w-full max-w-6xl text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
            {tournament.logo ? (
              <img 
                src={tournament.logo} 
                alt={`${tournament.name} logo`} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="text-3xl opacity-50">🏆</div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{tournament.name}</h1>
            <div className="text-sm opacity-70">{tournament.teamIds.length} teams • {tournament.matches.length} matches</div>
          </div>
        </div>
        
        {/* Tournament Info - Only show if not empty */}
        {tournament.location?.name && (
          <div className="flex items-center justify-center gap-2 text-sm mb-3">
            <LocationIcon size={16} />
            <span>{tournament.location.name}</span>
            {tournament.location.link && (
              <a 
                href={tournament.location.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                (map)
              </a>
            )}
          </div>
        )}
        
        {/* Social Media Links */}
        {(tournament.socialMedia?.facebook || tournament.socialMedia?.instagram) && (
          <div className="flex items-center justify-center gap-4 text-sm">
            {tournament.socialMedia?.facebook && (
              <a 
                href={tournament.socialMedia.facebook} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <FacebookIcon size={16} />
                <span>Facebook</span>
              </a>
            )}
            {tournament.socialMedia?.instagram && (
              <a 
                href={tournament.socialMedia.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <InstagramIcon size={16} />
                <span>Instagram</span>
              </a>
            )}
          </div>
        )}
      </section>

      {/* Championship Table or Group Tables - EXACTLY like admin page */}
      {(() => {
        const condition = tournament.format?.mode === 'groups_with_divisions' && (tournament.format?.groupsWithDivisionsConfig?.groups || tournament.format?.groupsWithDivisionsConfig)
        console.log('🎯 PublicTournamentPage render condition:', {
          formatMode: tournament.format?.mode,
          hasGroupsConfig: !!tournament.format?.groupsWithDivisionsConfig,
          hasGroups: !!(tournament.format?.groupsWithDivisionsConfig?.groups && tournament.format.groupsWithDivisionsConfig.groups.length > 0),
          groups: tournament.format?.groupsWithDivisionsConfig?.groups,
          conditionResult: condition,
          fullFormat: tournament.format
        })
        return condition
      })() ? (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold tracking-wide">Group Tables</h2>
            <p className="text-sm opacity-70 mt-1">
              Top 2 teams from each group advance to Division 1 playoffs. 3rd and 4th place go to Division 2 playoffs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              // Get groups from config or reconstruct from groupTables
              let groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
              
              // If no groups but we have groupTables, create groups from groupTables
              if (groups.length === 0 && Object.keys(groupTables).length > 0) {
                const config = tournament.format?.groupsWithDivisionsConfig
                const numberOfGroups = config?.numberOfGroups || Object.keys(groupTables).length
                const teamsPerGroup = config?.teamsPerGroup || 4
                
                // Reconstruct groups from groupTables
                groups = []
                for (let i = 1; i <= numberOfGroups; i++) {
                  const groupTable = (groupTables as Record<number, any[]>)[i] || []
                  const teamIds = groupTable.map((row: any) => row.id)
                  if (teamIds.length > 0) {
                    groups.push(teamIds)
                  } else {
                    // Fallback: distribute teams evenly
                    const startIdx = (i - 1) * teamsPerGroup
                    const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
                    groups.push(tournament.teamIds.slice(startIdx, endIdx))
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
              
              console.log('🎯 PublicTournamentPage rendering groups:', {
                groupsCount: groups.length,
                groups,
                groupTablesKeys: Object.keys(groupTables)
              })
              
              return groups.map((_groupTeams: string[], groupIndex: number) => {
                const groupTable = (groupTables as Record<number, any[]>)[groupIndex + 1] || []
                const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
              
              return (
                <div key={groupIndex} className="glass rounded-lg p-4 border border-white/10">
                  <h3 className="text-md font-semibold mb-3 text-center">Group {groupLetter}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="py-2 pr-2 text-left">Pos</th>
                          <th className="py-2 pr-2 text-left">Team</th>
                          <th className="py-2 pr-2 text-center">P</th>
                          <th className="py-2 pr-2 text-center">W</th>
                          <th className="py-2 pr-2 text-center">D</th>
                          <th className="py-2 pr-2 text-center">L</th>
                          <th className="py-2 pr-2 text-center">GF</th>
                          <th className="py-2 pr-2 text-center">GA</th>
                          <th className="py-2 pr-2 text-center font-semibold">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupTable.map((row: any, index: number) => {
                          const isTop2 = index < 2
                          const isTop4 = index < 4
                          return (
                            <tr 
                              key={row.id} 
                              className={`border-t border-white/5 ${isTop2 ? 'bg-green-500/10' : isTop4 ? 'bg-blue-500/10' : ''}`}
                            >
                              <td className="py-2 pr-2">{index + 1}</td>
                              <td className="py-2 pr-2 flex items-center gap-2">
                                {(() => {
                                  const team = teams.find((t: any) => t.id === row.id)
                                  if (team?.logo) {
                                    return (
                                      <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                        <img src={team.logo} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                                      </div>
                                    )
                                  } else {
                                    return (
                                      <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                                    )
                                  }
                                })()}
                                <Link 
                                  to={`/public/teams/${row.id}`}
                                  className="hover:opacity-80 transition-opacity text-xs"
                                >
                                  {teams.find((t: any) => t.id === row.id)?.name ?? row.id}
                                </Link>
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
                              </td>
                              <td className="py-2 pr-2 text-center">{row.p}</td>
                              <td className="py-2 pr-2 text-center">{row.w}</td>
                              <td className="py-2 pr-2 text-center">{row.d}</td>
                              <td className="py-2 pr-2 text-center">{row.l}</td>
                              <td className="py-2 pr-2 text-center">{row.gf}</td>
                              <td className="py-2 pr-2 text-center">{row.ga}</td>
                              <td className="py-2 pr-2 text-center font-semibold">{row.pts}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
            })()}
          </div>
        </section>
      ) : (
      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold tracking-wide">Championship Table</h2>
          {(tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && (
            <p className="text-sm opacity-70 mt-1">
              Top {tournament.format.playoffQualifiers} teams qualify for playoffs
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                  <th className="py-2 pr-2 text-left">Pos</th>
                  <th className="py-2 pr-2 text-left">Team</th>
                  <th className="py-2 pr-2 text-center">P</th>
                  <th className="py-2 pr-2 text-center">W</th>
                  <th className="py-2 pr-2 text-center">D</th>
                  <th className="py-2 pr-2 text-center">L</th>
                  <th className="py-2 pr-2 text-center">GF</th>
                  <th className="py-2 pr-2 text-center">GA</th>
                  <th className="py-2 pr-2 text-center font-semibold">Pts</th>
              </tr>
            </thead>
            <tbody>
                {table.map((row: any, index: number) => {
                const isEliminated = eliminatedTeams.has(row.id)
                return (
                    <tr 
                      key={row.id} 
                      className={`border-t border-white/5 ${isEliminated ? 'opacity-50' : ''}`}
                    >
                      <td className="py-2 pr-2">{index + 1}</td>
                      <td className="py-2 pr-2 flex items-center gap-2">
                      {(() => {
                        const team = teams.find((t: any) => t.id === row.id)
                        if (team?.logo) {
                          return (
                              <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                              <img src={team.logo} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                            </div>
                          )
                        } else {
                          return (
                              <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                          )
                        }
                      })()}
                      <Link 
                        to={`/public/teams/${row.id}`}
                          className="hover:opacity-80 transition-opacity text-xs"
                      >
                        {teams.find((t: any) => t.id === row.id)?.name ?? row.id}
                      </Link>
                        {isEliminated && (
                          <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full">
                            Eliminated
                        </span>
                      )}
                    </td>
                      <td className="py-2 pr-2 text-center">{row.p}</td>
                      <td className="py-2 pr-2 text-center">{row.w}</td>
                      <td className="py-2 pr-2 text-center">{row.d}</td>
                      <td className="py-2 pr-2 text-center">{row.l}</td>
                      <td className="py-2 pr-2 text-center">{row.gf}</td>
                      <td className="py-2 pr-2 text-center">{row.ga}</td>
                      <td className="py-2 pr-2 text-center font-semibold">{row.pts}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Fixtures Section */}
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-lg font-semibold tracking-wide mb-4 text-center">Fixtures</h2>
        <div className="space-y-4">
          {tournament.matches && tournament.matches.length > 0 ? (
            tournament.matches.map((match: any) => {
                        const homeTeam = teams.find((t: any) => t.id === match.homeTeamId)
                        const awayTeam = teams.find((t: any) => t.id === match.awayTeamId)
                        
              return (
                <div 
                  key={match.id} 
                  className="glass rounded-lg p-4 border border-white/10 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center gap-2 flex-1">
                        {homeTeam?.logo ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                            <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                            <span className="text-xs opacity-50">H</span>
                          </div>
                        )}
                    <Link 
                          to={`/public/teams/${match.homeTeamId}`}
                          className="hover:opacity-80 transition-opacity text-sm font-medium"
                    >
                          {homeTeam?.name || match.homeTeamId}
                    </Link>
                      </div>
                      
                      <div className="flex items-center gap-2 px-4">
                        {match.homeGoals != null && match.awayGoals != null ? (
                          <>
                            <span className="text-lg font-semibold">{match.homeGoals}</span>
                            <span className="opacity-50">-</span>
                            <span className="text-lg font-semibold">{match.awayGoals}</span>
                          </>
                        ) : (
                          <span className="text-sm opacity-50">vs</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-1 justify-end">
                    <Link 
                          to={`/public/teams/${match.awayTeamId}`}
                          className="hover:opacity-80 transition-opacity text-sm font-medium"
                    >
                          {awayTeam?.name || match.awayTeamId}
                    </Link>
                        {awayTeam?.logo ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                            <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                            <span className="text-xs opacity-50">A</span>
                  </div>
                    )}
                  </div>
                </div>
                  </div>
                  {match.isPlayoff && (
                    <div className="text-xs opacity-50 mt-2 text-center">
                      {match.playoffRound ? `Round ${match.playoffRound}` : 'Playoff Match'}
                </div>
                  )}
                </div>
              )
            })
          ) : (
            <p className="text-center opacity-50">No matches scheduled yet.</p>
                  )}
                </div>
      </section>
    </div>
  )
}
