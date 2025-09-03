import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo } from 'react'
import { generatePlayoffBrackets } from '../utils/schedule'
import LocationIcon from '../components/LocationIcon'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'

export default function PublicTournamentPage() {
  const { id } = useParams()
  const { getAllTournaments, teams: allTeams } = useAppStore()
  
  const tournaments = getAllTournaments()
  const teams = allTeams
  
  // Find the specific tournament by ID
  const tournament = tournaments.find(t => t.id === id)
  
  // Show tournament not found if it doesn't exist
  if (!tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament Not Found</h1>
          <p className="opacity-80 mb-6">The tournament you're looking for doesn't exist.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const rounds = useMemo(() => {
    if (!tournament) return [] as { round: number; matchIds: string[] }[]
    
    // Only include league matches (non-playoff matches)
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    
    const groups: Record<number, string[]> = {}
    for (const m of leagueMatches) {
      const r = m.round ?? 0
      groups[r] = groups[r] || []
      groups[r].push(m.id)
    }
    return Object.entries(groups)
      .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
      .sort((a, b) => a.round - b.round)
  }, [tournament])

  // Separate playoff matches
  const playoffMatches = useMemo(() => {
    if (!tournament) return []
    return tournament.matches.filter(m => m.isPlayoff)
  }, [tournament])

  // Check if championship is finished (all league matches have scores)
  const isChampionshipFinished = useMemo(() => {
    if (!tournament) return false
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    return leagueMatches.length > 0 && leagueMatches.every(m => m.homeGoals != null && m.awayGoals != null)
  }, [tournament])

  // Get playoff structure based on tournament format
  const playoffStructure = useMemo(() => {
            if (!tournament || !tournament.format || (tournament.format.mode !== 'league_playoff' && tournament.format.mode !== 'swiss_elimination')) return null
    
    const qualifiers = tournament.format.playoffQualifiers || 4
    const rounds = Math.ceil(Math.log2(qualifiers))
    
    return {
      qualifiers,
      rounds,
      structure: generatePlayoffBrackets([...Array(qualifiers)].map((_, i) => `team_${i}`))
    }
  }, [tournament])

  const calculateTable = () => {
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    for (const tid of tournament.teamIds) {
      stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
    }
    
    // Only count league matches for the table
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    
    for (const m of leagueMatches) {
      if (m.homeGoals == null || m.awayGoals == null) continue
      const a = stats[m.homeTeamId]
      const b = stats[m.awayTeamId]
      a.p++; b.p++
      a.gf += m.homeGoals; a.ga += m.awayGoals
      b.gf += m.awayGoals; b.ga += m.homeGoals
      if (m.homeGoals > m.awayGoals) { a.w++; b.l++; a.pts += 3 }
      else if (m.homeGoals < m.awayGoals) { b.w++; a.l++; b.pts += 3 }
      else { a.d++; b.d++; a.pts++; b.pts++ }
    }
    return Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
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
                        const team = teams.find(t => t.id === row.id)
                        if (team?.logo) {
                          return (
                            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                              <img src={team.logo} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                            </div>
                          )
                        } else {
                          return (
                            <span className="h-3 w-3 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                          )
                        }
                      })()}
                      <Link 
                        to={`/public/teams/${row.id}`}
                        className="hover:opacity-80 transition-opacity"
                      >
                        {teams.find(t => t.id === row.id)?.name ?? row.id}
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
              {(tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && playoffMatches.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold tracking-wide">Playoff Bracket</h2>
          </div>

          <div className="grid gap-6">
            {/* Playoff Rounds */}
            {Array.from({ length: playoffStructure?.rounds || 0 }, (_, roundIndex) => {
              const roundMatches = playoffMatches.filter(m => m.playoffRound === roundIndex)
              const roundName = getPlayoffRoundName(roundIndex, playoffStructure?.rounds || 0)
              
              return (
                <div key={roundIndex} className="glass rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4 text-center">{roundName}</h3>
                  <div className="grid gap-3">
                    {roundMatches.map((match) => {
                      const homeTeam = teams.find(t => t.id === match.homeTeamId)
                      const awayTeam = teams.find(t => t.id === match.awayTeamId)
                      
                      return (
                        <div key={match.id} className="grid md:grid-cols-4 gap-2 items-center p-3 glass rounded-lg">
                          <div className="md:col-span-2 flex items-center gap-2">
                            {(() => {
                              if (homeTeam?.logo) {
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
                            <Link 
                              to={`/public/teams/${match.homeTeamId}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {homeTeam?.name ?? 'TBD'}
                            </Link>
                            <Link 
                              to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                              className="hover:opacity-80 transition-opacity font-semibold"
                            >
                              {' vs '}
                            </Link>
                            {(() => {
                              if (awayTeam?.logo) {
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
                            <Link 
                              to={`/public/teams/${match.awayTeamId}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {awayTeam?.name ?? 'TBD'}
                            </Link>
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
              )
            })}
          </div>
        </section>
      )}

      <section className="grid gap-3 w-full max-w-3xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Fixtures</h2>
        {rounds.map((r) => (
          <div key={r.round} className="glass rounded-xl p-4 grid gap-2">
            <div className="font-medium">Round {r.round + 1}</div>
            {r.matchIds.map((mid) => {
              const m = tournament.matches.find((x) => x.id === mid)!
              return (
                <div key={mid} className="grid md:grid-cols-4 gap-2 items-center">
                  <div className="md:col-span-2 flex items-center gap-2">
                    {(() => {
                      const homeTeam = teams.find(t => t.id === m.homeTeamId)
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
                      {teams.find(t => t.id === m.homeTeamId)?.name ?? 'Home'}
                    </Link>
                    <Link 
                      to={`/public/tournaments/${tournament.id}/matches/${m.id}`}
                      className="hover:opacity-80 transition-opacity font-semibold"
                    >
                      {' vs '}
                    </Link>
                    {(() => {
                      const awayTeam = teams.find(t => t.id === m.awayTeamId)
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
                      {teams.find(t => t.id === m.awayTeamId)?.name ?? 'Away'}
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
            {playoffMatches.map((m) => (
              <div key={m.id} className="grid md:grid-cols-4 gap-2 items-center">
                <div className="md:col-span-2">
                  <Link 
                    to={`/public/teams/${m.homeTeamId}`}
                    className="hover:opacity-80 transition-opacity"
                  >
                    {teams.find(t => t.id === m.homeTeamId)?.name ?? 'TBD'}
                  </Link>
                  {' vs '}
                  <Link 
                    to={`/public/teams/${m.awayTeamId}`}
                    className="hover:opacity-80 transition-opacity"
                  >
                    {teams.find(t => t.id === m.awayTeamId)?.name ?? 'TBD'}
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

// Helper function to get playoff round names
function getPlayoffRoundName(roundIndex: number, totalRounds: number): string {
  if (totalRounds === 1) return 'Final'
  if (totalRounds === 2) return roundIndex === 0 ? '1/2 Final' : 'Final'
  if (totalRounds === 3) {
    if (roundIndex === 0) return '1/4 Final'
    if (roundIndex === 1) return '1/2 Final'
    return 'Final'
  }
  if (totalRounds === 4) {
    if (roundIndex === 0) return '1/8 Final'
    if (roundIndex === 1) return '1/4 Final'
    if (roundIndex === 2) return '1/2 Final'
    return 'Final'
  }
  return `Round ${roundIndex + 1}`
}
