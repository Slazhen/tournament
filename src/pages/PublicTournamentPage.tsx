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
        await Promise.all([loadTournaments(), loadTeams()])
        setDataLoaded(true)
      } catch (error) {
        console.error('Error loading data for public tournament page:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [loadTournaments, loadTeams])

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
    
    // Debug logging
    console.log('PublicTournamentPage Debug:', {
      tournamentId: actualTournamentId,
      orgName,
      totalTournaments: tournaments.length,
      totalTeams: teams.length,
      tournaments: tournaments.map(t => t ? { 
        id: t.id, 
        name: t.name, 
        organizerId: t.organizerId,
        teamIds: t.teamIds?.length || 0,
        matches: t.matches?.length || 0
      } : null).filter(Boolean),
      teams: teams.map(t => t ? { id: t.id, name: t.name, organizerId: t.organizerId } : null).filter(Boolean),
      rawTournaments: tournaments,
      rawTeams: teams
    })
    
    // Check if tournament exists
    if (tournaments.length > 0) {
      console.log('Found tournament:', tournaments.find(t => t && t.id === actualTournamentId))
    }
    
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

  // Additional safety check for tournament data structure
  if (!tournament.matches || !Array.isArray(tournament.matches) || 
      !tournament.teamIds || !Array.isArray(tournament.teamIds)) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Invalid Tournament Data</h1>
          <p className="opacity-80 mb-6">The tournament data is corrupted or incomplete.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const rounds = useMemo(() => {
    if (!tournament || !tournament.matches || !Array.isArray(tournament.matches)) {
      return [] as { round: number; matchIds: string[] }[]
    }
    
    try {
      // Only include league matches (non-playoff matches)
      const leagueMatches = tournament.matches.filter((m: any) => m && !m.isPlayoff)
      
      const groups: Record<number, string[]> = {}
      for (const m of leagueMatches) {
        if (m && typeof m === 'object') {
          const r = (m as any).round ?? 0
          groups[r] = groups[r] || []
          groups[r].push((m as any).id)
        }
      }
      return Object.entries(groups)
        .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
        .sort((a, b) => a.round - b.round)
    } catch (error) {
      console.error('Error calculating rounds:', error)
      return [] as { round: number; matchIds: string[] }[]
    }
  }, [tournament])

  // Separate playoff matches
  const playoffMatches = useMemo(() => {
    if (!tournament) {
      console.log('PublicTournamentPage: No tournament found')
      return []
    }
    
    console.log('PublicTournamentPage: Tournament found:', {
      id: tournament.id,
      format: tournament.format,
      customPlayoffConfig: tournament.format?.customPlayoffConfig,
      playoffRounds: tournament.format?.customPlayoffConfig?.playoffRounds
    })
    
    try {
      let matches = []
      
      // Get playoff matches from tournament.matches
      if (tournament.matches && Array.isArray(tournament.matches)) {
        matches = tournament.matches.filter((m: any) => m && m.isPlayoff)
        console.log('PublicTournamentPage: Regular playoff matches found:', matches.length)
      }
      
      // For custom playoff format, also include matches from custom playoff configuration
      if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
        console.log('PublicTournamentPage: Processing custom playoff rounds:', tournament.format.customPlayoffConfig.playoffRounds.length)
        const customPlayoffMatches: any[] = []
        tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any, roundIndex: number) => {
          console.log(`PublicTournamentPage: Processing round ${roundIndex}:`, round)
          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((match: any) => {
              customPlayoffMatches.push({
                ...match,
                playoffRound: roundIndex,
                isPlayoff: true,
                roundName: round.name,
                roundDescription: round.description
              })
            })
          }
        })
        console.log('PublicTournamentPage: Custom playoff matches created:', customPlayoffMatches.length)
        matches = [...matches, ...customPlayoffMatches]
      }
      
      console.log('PublicTournamentPage: Total playoff matches:', matches.length)
      return matches
    } catch (error) {
      console.error('Error calculating playoff matches:', error)
      return []
    }
  }, [tournament])

  // Check if championship is finished (all league matches have scores)
  // const isChampionshipFinished = useMemo(() => {
  //   if (!tournament) return false
  //   const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
  //   return leagueMatches.length > 0 && leagueMatches.every(m => m.homeGoals != null && m.awayGoals != null)
  // }, [tournament])


  const calculateTable = () => {
    if (!tournament || !tournament.teamIds || !Array.isArray(tournament.teamIds) || 
        !tournament.matches || !Array.isArray(tournament.matches)) {
      return []
    }
    
    try {
      const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
      for (const tid of tournament.teamIds) {
        if (tid) {
          stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        }
      }
      
      // Only count league matches for the table
      const leagueMatches = tournament.matches.filter((m: any) => m && !m.isPlayoff)
      
      for (const m of leagueMatches) {
        if (!m || (m as any).homeGoals == null || (m as any).awayGoals == null) continue
        
        const homeTeamId = (m as any).homeTeamId
        const awayTeamId = (m as any).awayTeamId
        
        if (!homeTeamId || !awayTeamId) continue
        
        const a = stats[homeTeamId]
        const b = stats[awayTeamId]
        
        if (!a || !b) continue
        
        a.p++; b.p++
        a.gf += (m as any).homeGoals; a.ga += (m as any).awayGoals
        b.gf += (m as any).awayGoals; b.ga += (m as any).homeGoals
        
        if ((m as any).homeGoals > (m as any).awayGoals) { a.w++; b.l++; a.pts += 3 }
        else if ((m as any).homeGoals < (m as any).awayGoals) { b.w++; a.l++; b.pts += 3 }
        else { a.d++; b.d++; a.pts++; b.pts++ }
      }
      
      return Object.entries(stats).map(([id, s]) => ({ id, ...s }))
        .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
    } catch (error) {
      console.error('Error calculating table:', error)
      return []
    }
  }

  const table = useMemo(() => calculateTable(), [tournament])

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
                🔗
              </a>
            )}
          </div>
        )}
        
        {/* Social Media - Only show if not empty */}
        {(tournament.socialMedia?.facebook || tournament.socialMedia?.instagram) && (
          <div className="flex items-center justify-center gap-4 text-sm mb-3">
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

      {/* Championship Table */}
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
                <th className="py-2 pr-3">Pos</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3">P</th>
                <th className="py-2 pr-3">W</th>
                <th className="py-2 pr-3">D</th>
                <th className="py-2 pr-3">L</th>
                <th className="py-2 pr-3">GF</th>
                <th className="py-2 pr-3">GA</th>
                <th className="py-2 pr-3">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, index) => {
                const isQualified = (tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && 
                  index < (tournament.format?.playoffQualifiers || 4)
                
                return (
                  <tr key={row.id} className={`border-t border-white/10 ${isQualified ? 'bg-green-500/10' : ''}`}>
                    <td className="py-2 pr-3">{index + 1}</td>
                    <td className="py-2 pr-3 flex items-center gap-2">
                      {(() => {
                        const team = teams.find((t: any) => t.id === row.id)
                        if (team?.logo) {
                          return (
                            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                              <img src={team.logo} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                            </div>
                          )
                        } else {
                          return (
                            <span className="h-4 w-4 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                          )
                        }
                      })()}
                      <Link 
                        to={`/public/teams/${row.id}`}
                        className="hover:opacity-80 transition-opacity"
                      >
                        {teams.find((t: any) => t.id === row.id)?.name ?? row.id}
                      </Link>
                      {isQualified && (
                        <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                          Qualified
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{row.p}</td>
                    <td className="py-2 pr-3">{row.w}</td>
                    <td className="py-2 pr-3">{row.d}</td>
                    <td className="py-2 pr-3">{row.l}</td>
                    <td className="py-2 pr-3">{row.gf}</td>
                    <td className="py-2 pr-3">{row.ga}</td>
                    <td className="py-2 pr-3 font-semibold">{row.pts}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Playoff Bracket Section */}
              {(() => {
                const shouldShowPlayoff = (tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination' || tournament.format?.mode === 'league_custom_playoff') && 
                  (playoffMatches.length > 0 || (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds?.length > 0))
                
                console.log('PublicTournamentPage: Playoff bracket visibility check:', {
                  mode: tournament.format?.mode,
                  playoffMatchesLength: playoffMatches.length,
                  customPlayoffRoundsLength: tournament.format?.customPlayoffConfig?.playoffRounds?.length,
                  shouldShowPlayoff
                })
                
                return shouldShowPlayoff
              })() && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold tracking-wide">Playoff Bracket</h2>
          </div>

          <div className="grid gap-6">
            {/* Playoff Rounds */}
            {playoffMatches.length > 0 && (
              // Group matches by round and display them
              (() => {
                const roundsMap = new Map()
                
                playoffMatches.forEach((match: any) => {
                  const roundKey = match.roundName || `Round ${(match.playoffRound || 0) + 1}`
                  if (!roundsMap.has(roundKey)) {
                    roundsMap.set(roundKey, {
                      name: roundKey,
                      description: match.roundDescription,
                      matches: []
                    })
                  }
                  roundsMap.get(roundKey).matches.push(match)
                })
                
                return Array.from(roundsMap.values()).map((round: any, roundIndex: number) => (
                  <div key={roundIndex} className="glass rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4 text-center">
                      {round.name}
                      {round.description && (
                        <span className="block text-sm font-normal opacity-70 mt-1">{round.description}</span>
                      )}
                    </h3>
                    <div className="grid gap-3">
                      {round.matches.map((match: any) => {
                        const homeTeam = teams.find((t: any) => t.id === match.homeTeamId)
                        const awayTeam = teams.find((t: any) => t.id === match.awayTeamId)
                        
                        return (
                          <div key={match.id} className={`relative grid md:grid-cols-4 gap-2 items-center p-3 glass rounded-lg ${match.isElimination ? 'border-2 border-red-500 bg-red-500/10' : ''}`}>
                            {match.isElimination && (
                              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
                                🔥 ELIMINATION
                              </div>
                            )}
                            <div className="md:col-span-2 flex items-center gap-2">
                              {(() => {
                                if (match.homeTeamId === 'BYE') {
                                  return (
                                    <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold">
                                      B
                                    </div>
                                  )
                                } else if (homeTeam?.logo) {
                                  return (
                                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                      <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                                    </div>
                                  )
                                } else if (homeTeam) {
                                  return (
                                    <span className="h-3 w-3 rounded-full inline-block" style={{ background: homeTeam.colors?.[0] || '#3B82F6' }} />
                                  )
                                }
                                return null
                              })()}
                              {match.homeTeamId === 'BYE' ? (
                                <span className="font-medium text-yellow-400">BYE</span>
                              ) : (
                                <Link 
                                  to={`/public/teams/${match.homeTeamId}`}
                                  className="hover:opacity-80 transition-opacity"
                                >
                                  {homeTeam?.name || 'Home'}
                                </Link>
                              )}
                              <Link 
                                to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                                className="hover:opacity-80 transition-opacity font-semibold"
                              >
                                {' vs '}
                              </Link>
                              {(() => {
                                if (match.awayTeamId === 'BYE') {
                                  return (
                                    <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold">
                                      B
                                    </div>
                                  )
                                } else if (awayTeam?.logo) {
                                  return (
                                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                      <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                                    </div>
                                  )
                                } else if (awayTeam) {
                                  return (
                                    <span className="h-3 w-3 rounded-full inline-block" style={{ background: awayTeam.colors?.[0] || '#3B82F6' }} />
                                  )
                                }
                                return null
                              })()}
                              {match.awayTeamId === 'BYE' ? (
                                <span className="font-medium text-yellow-400">BYE</span>
                              ) : (
                                <Link 
                                  to={`/public/teams/${match.awayTeamId}`}
                                  className="hover:opacity-80 transition-opacity"
                                >
                                  {awayTeam?.name || 'Away'}
                                </Link>
                              )}
                            </div>
                            <div className="text-center">
                              {match.homeGoals != null && match.awayGoals != null ? (
                                <Link 
                                  to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                                  className="text-lg font-semibold hover:opacity-80 transition-opacity"
                                >
                                  {match.homeGoals} : {match.awayGoals}
                                </Link>
                              ) : (
                                <Link 
                                  to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                                  className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                                >
                                  TBD
                                </Link>
                              )}
                            </div>
                            <div className="text-center">
                              {match.dateISO ? (
                                <span className="text-sm">
                                  {new Date(match.dateISO).toLocaleDateString()}
                                  {match.time && (
                                    <span className="block text-xs opacity-70">
                                      {match.time}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-sm opacity-70">TBD</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()
            )}
          </div>
        </section>
      )}

      <section className="grid gap-3 w-full max-w-3xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Fixtures</h2>
        {rounds.map((r) => (
          <div key={r.round} className="glass rounded-xl p-4 grid gap-2">
            <div className="font-medium">Round {r.round + 1}</div>
            {r.matchIds.map((mid) => {
              const m = tournament.matches.find((x: any) => x.id === mid)!
              return (
                <div key={mid} className="grid md:grid-cols-4 gap-2 items-center">
                  <div className="md:col-span-2 flex items-center gap-2">
                    {(() => {
                      const homeTeam = teams.find((t: any) => t.id === m.homeTeamId)
                      if (homeTeam?.logo) {
                        return (
                          <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                            <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                          </div>
                        )
                      } else {
                        return (
                          <span className="h-3 w-3 rounded-full inline-block" style={{ background: homeTeam?.colors?.[0] || '#3B82F6' }} />
                        )
                      }
                    })()}
                    <Link 
                      to={`/public/teams/${m.homeTeamId}`}
                      className="hover:opacity-80 transition-opacity"
                    >
                      {teams.find((t: any) => t.id === m.homeTeamId)?.name ?? 'Home'}
                    </Link>
                    <Link 
                      to={`/public/tournaments/${tournament.id}/matches/${m.id}`}
                      className="hover:opacity-80 transition-opacity font-semibold"
                    >
                      {' vs '}
                    </Link>
                    {(() => {
                      const awayTeam = teams.find((t: any) => t.id === m.awayTeamId)
                      if (awayTeam?.logo) {
                        return (
                          <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                            <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                          </div>
                        )
                      } else {
                        return (
                          <span className="h-3 w-3 rounded-full inline-block" style={{ background: awayTeam?.colors?.[0] || '#3B82F6' }} />
                        )
                      }
                    })()}
                    <Link 
                      to={`/public/teams/${m.awayTeamId}`}
                      className="hover:opacity-80 transition-opacity"
                    >
                      {teams.find((t: any) => t.id === m.awayTeamId)?.name ?? 'Away'}
                    </Link>
                  </div>
                  <div className="text-center">
                    {m.homeGoals != null && m.awayGoals != null ? (
                      <Link 
                        to={`/public/tournaments/${tournament.id}/matches/${m.id}`}
                        className="text-lg font-semibold hover:opacity-80 transition-opacity"
                      >
                        {m.homeGoals} : {m.awayGoals}
                      </Link>
                    ) : (
                      <Link 
                        to={`/public/tournaments/${tournament.id}/matches/${m.id}`}
                        className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                      >
                        TBD
                      </Link>
                    )}
                  </div>
                  <div className="text-center">
                    {m.dateISO ? (
                      <span className="text-sm">
                        {new Date(m.dateISO).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-sm opacity-70">TBD</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* Playoff Matches in Fixtures */}
        {playoffMatches.length > 0 && (
          <div className="glass rounded-xl p-4 grid gap-2">
            <div className="font-medium">Playoff Matches</div>
            {playoffMatches.map((m: any) => (
              <div key={m.id} className={`relative grid md:grid-cols-4 gap-2 items-center p-3 rounded-lg ${m.isElimination ? 'border-2 border-red-500 bg-red-500/10' : 'glass'}`}>
                {m.isElimination && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
                    🔥 ELIMINATION
                  </div>
                )}
                <div className="md:col-span-2">
                  <Link 
                    to={`/public/teams/${m.homeTeamId}`}
                    className="hover:opacity-80 transition-opacity"
                  >
                    {teams.find((t: any) => t.id === m.homeTeamId)?.name ?? 'TBD'}
                  </Link>
                  {' vs '}
                  <Link 
                    to={`/public/teams/${m.awayTeamId}`}
                    className="hover:opacity-80 transition-opacity"
                  >
                    {teams.find((t: any) => t.id === m.awayTeamId)?.name ?? 'TBD'}
                  </Link>
                </div>
                <div className="text-center">
                  {m.homeGoals != null && m.awayGoals != null ? (
                    <span className="text-lg font-semibold">
                      {m.homeGoals} : {m.awayGoals}
                    </span>
                  ) : (
                    <span className="text-sm opacity-70">TBD</span>
                  )}
                </div>
                <div className="text-center">
                  {m.dateISO ? (
                    <span className="text-sm">
                      {new Date(m.dateISO).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-sm opacity-70">TBD</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

