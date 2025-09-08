import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo } from 'react'
import { generatePlayoffBrackets } from '../utils/schedule'
import LocationIcon from '../components/LocationIcon'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import LogoUploader from '../components/LogoUploader'

export default function TournamentPage() {
  const { id } = useParams()
  const { getCurrentOrganizer, getOrganizerTournaments, getOrganizerTeams, updateTournament, deleteTournament, uploadTournamentLogo } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()
  const teams = getOrganizerTeams()
  
  // Find the specific tournament by ID
  const tournament = tournaments.find(t => t.id === id)
  
  // Redirect if no organizer is selected
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
  
  // Show tournament not found if it doesn't exist
  if (!tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament Not Found</h1>
          <p className="opacity-80 mb-6">The tournament you're looking for doesn't exist or you don't have access to it.</p>
          <Link to="/tournaments" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to Tournaments
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
            if (!tournament || !tournament.format || (tournament.format.mode !== 'league_playoff' && tournament.format.mode !== 'swiss_elimination' && tournament.format.mode !== 'custom_playoff_homebush')) return null
    
    if (tournament.format.mode === 'custom_playoff_homebush') {
      // Custom playoff has exactly 6 rounds
      const playoffTeams = tournament.format.customPlayoffConfig?.playoffTeams || 8
      return {
        qualifiers: playoffTeams,
        rounds: 6, // Custom playoff has 6 rounds
        structure: [] // Custom playoff doesn't use standard bracket structure
      }
    } else {
      // Standard playoff formats
      const qualifiers = tournament.format.playoffQualifiers || 4
      const rounds = Math.ceil(Math.log2(qualifiers))
      
      return {
        qualifiers,
        rounds,
        structure: generatePlayoffBrackets([...Array(qualifiers)].map((_, i) => `team_${i}`))
      }
    }
  }, [tournament])

  function setScore(mid: string, homeGoals: number, awayGoals: number) {
    if (!tournament) return
    const matches = tournament.matches.map((m) => (m.id === mid ? { ...m, homeGoals: isNaN(homeGoals) ? undefined : homeGoals, awayGoals: isNaN(awayGoals) ? undefined : awayGoals } : m))
    updateTournament(tournament.id, { matches })
  }

  function setPlayoffTeams(mid: string, homeTeamId: string, awayTeamId: string) {
    if (!tournament) return
    const matches = tournament.matches.map((m) => (m.id === mid ? { ...m, homeTeamId, awayTeamId } : m))
    updateTournament(tournament.id, { matches })
  }

  function setDate(mid: string, dateISO: string) {
    if (!tournament) return
    const matches = tournament.matches.map((m) => (m.id === mid ? { ...m, dateISO } : m))
    updateTournament(tournament.id, { matches })
  }

  const handleEndChampionship = () => {
    if (!tournament || !playoffStructure) return
    
    // Get current table standings
    const table = calculateTable()
    const qualifiedTeams = table.slice(0, playoffStructure.qualifiers)
    
    // Create playoff matches
    const playoffMatches = createPlayoffMatches(qualifiedTeams, tournament.id)
    
    // Update tournament with playoff matches
    updateTournament(tournament.id, {
      matches: [...tournament.matches, ...playoffMatches]
    })
  }

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

  // Helper function to create playoff matches
  const createPlayoffMatches = (qualifiedTeams: any[], tournamentId: string) => {
    const matches = []
    const qualifiers = qualifiedTeams.length
    const rounds = Math.ceil(Math.log2(qualifiers))
    
    // Create matches based on seeding (1st vs last, 2nd vs second to last, etc.)
    for (let round = 0; round < rounds; round++) {
      const matchesInRound = Math.pow(2, rounds - round - 1)
      for (let match = 0; match < matchesInRound; match++) {
        const matchId = `playoff_${tournamentId}_${round}_${match}`
        
        if (round === 0) {
          // First round - seed teams
          const team1Index = match
          const team2Index = qualifiers - 1 - match
          
          matches.push({
            id: matchId,
            tournamentId,
            homeTeamId: qualifiedTeams[team1Index].id,
            awayTeamId: qualifiedTeams[team2Index].id,
            round: rounds + round, // Start after league rounds
            isPlayoff: true,
            playoffRound: round,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined
          })
        } else {
          // Later rounds - placeholder matches
          matches.push({
            id: matchId,
            tournamentId,
            homeTeamId: `winner_${round-1}_${match*2}`,
            awayTeamId: `winner_${round-1}_${match*2+1}`,
            round: rounds + round,
            isPlayoff: true,
            playoffRound: round,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined
          })
        }
      }
    }
    
    return matches
  }

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
               
               {/* Quick Actions */}
               <div className="flex justify-center gap-4 mt-4">
                 <button
                   onClick={() => {
                     if (confirm(`Are you sure you want to delete the tournament "${tournament.name}"?\n\nThis will permanently remove:\n• All match results\n• Tournament standings\n• Playoff brackets\n• Tournament data\n\nThis action cannot be undone.`)) {
                       deleteTournament(tournament.id)
                       window.location.href = '/tournaments'
                     }
                   }}
                   className="px-4 py-2 rounded-lg glass hover:bg-red-500/20 hover:text-red-300 transition-all font-medium border border-red-500/30 text-red-400 text-sm"
                   title="Delete tournament"
                 >
                   🗑️ Delete Tournament
                 </button>
               </div>
               
               {/* Public Link */}
               <div className="mt-4 flex justify-center">
                 <div className="text-center">
                   <label className="block text-sm font-medium mb-2">Public Link</label>
                   <div className="flex items-center gap-2">
                     <input
                       type="text"
                       readOnly
                       value={`${window.location.origin}/public/tournaments/${tournament.id}`}
                       className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-center min-w-[300px] text-sm"
                     />
                     <button
                       onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/tournaments/${tournament.id}`)}
                       className="px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                       title="Copy to clipboard"
                     >
                       📋 Copy
                     </button>
                   </div>
                 </div>
               </div>
               
               {/* Delete Tournament */}
               <div className="mt-4 flex justify-center">
                 <button
                   onClick={() => {
                     if (confirm(`Are you sure you want to delete the tournament "${tournament.name}"?\n\nThis will permanently remove:\n• All match results\n• Tournament standings\n• Playoff brackets\n• Tournament data\n\nThis action cannot be undone.`)) {
                       deleteTournament(tournament.id)
                       // Navigate back to tournaments page after deletion
                       window.location.href = '/tournaments'
                     }
                   }}
                   className="px-6 py-3 rounded-lg glass hover:bg-red-500/20 hover:text-red-300 transition-all font-medium border border-red-500/30 text-red-400"
                   title="Delete tournament"
                 >
                   🗑️ Delete Tournament
                 </button>
               </div>
               
               {/* Tournament Logo Upload Section */}
               <div className="mt-4 flex justify-center">
                 <div className="text-center">
                   <label className="block text-sm font-medium mb-2">Tournament Logo</label>
                   <LogoUploader 
                     onLogoUpload={(file) => uploadTournamentLogo(tournament.id, file)}
                     currentLogo={tournament.logo}
                     size={80}
                   />
                 </div>
               </div>
        
                                      {/* Tournament Info Editing */}
               <div className="flex items-center justify-center gap-4 text-sm mb-3">
                 <div className="flex items-center gap-2">
                   <LocationIcon size={16} />
                   <input
                     type="text"
                     placeholder="Tournament location name..."
                     value={tournament.location?.name || ''}
                                          onChange={(e) => updateTournament(tournament.id, { 
                       location: { 
                         ...tournament.location, 
                         name: e.target.value || undefined 
                       }
                     })}
                     className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-center min-w-[200px]"
                   />
                 </div>
                 <div className="flex items-center gap-2">
                   <span>🔗</span>
                   <input
                     type="url"
                     placeholder="Location link..."
                     value={tournament.location?.link || ''}
                                          onChange={(e) => updateTournament(tournament.id, { 
                       location: { 
                         ...tournament.location, 
                         link: e.target.value || undefined 
                       }
                     })}
                     className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-center min-w-[200px]"
                   />
                 </div>
               </div>
        
                       <div className="flex items-center justify-center gap-4 text-sm mb-3">
                 <div className="flex items-center gap-2">
                   <FacebookIcon size={16} />
                   <input
                     type="url"
                     placeholder="Facebook page..."
                     value={tournament.socialMedia?.facebook || ''}
                                          onChange={(e) => updateTournament(tournament.id, { 
                       socialMedia: { 
                         ...tournament.socialMedia, 
                         facebook: e.target.value || undefined 
                       }
                     })}
                     className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-center min-w-[200px]"
                   />
                 </div>
                 <div className="flex items-center gap-2">
                   <InstagramIcon size={16} />
                   <input
                     type="url"
                     placeholder="Instagram profile..."
                     value={tournament.socialMedia?.instagram || ''}
                                          onChange={(e) => updateTournament(tournament.id, { 
                       socialMedia: { 
                         ...tournament.socialMedia, 
                         instagram: e.target.value || undefined 
                       }
                     })}
                     className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-center min-w-[200px]"
                   />
                 </div>
               </div>
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
                             to={`/teams/${row.id}`}
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
              {(tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-center tracking-wide">Playoff Bracket</h2>
            {isChampionshipFinished && playoffMatches.length === 0 && (
              <button
                onClick={handleEndChampionship}
                className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all active:scale-95 active:shadow-inner font-medium bg-green-500/20 text-green-300 border border-green-500/30"
              >
                🏆 End Championship & Start Playoffs
              </button>
            )}
          </div>

          {playoffMatches.length === 0 ? (
            <div className="text-center opacity-70">
              {isChampionshipFinished ? (
                <div className="space-y-3">
                  <p>✅ Championship completed! Ready to start playoffs.</p>
                  <p className="text-sm">Top {tournament.format?.playoffQualifiers || 4} teams will qualify for playoffs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>⏳ Complete all championship matches to start playoffs</p>
                  <p className="text-sm">You need to add scores to all league matches first.</p>
                </div>
              )}
            </div>
          ) : (
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
                          <div key={match.id} className="grid md:grid-cols-5 gap-2 items-center p-3 glass rounded-lg">
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
                                       to={`/teams/${match.homeTeamId}`}
                                       className="hover:opacity-80 transition-opacity"
                                     >
                                       {homeTeam?.name ?? 'TBD'}
                                     </Link>
                                   )}
                                   {' vs '}
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
                                       to={`/teams/${match.awayTeamId}`}
                                       className="hover:opacity-80 transition-opacity"
                                     >
                                       {awayTeam?.name ?? 'TBD'}
                                     </Link>
                                   )}
                                 </div>
                            <div className="flex gap-2 items-center">
                              <input inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={match.homeGoals ?? ''} onChange={(e) => setScore(match.id, e.target.value === '' ? NaN : Number(e.target.value), match.awayGoals ?? NaN)} />
                              <span>:</span>
                              <input inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={match.awayGoals ?? ''} onChange={(e) => setScore(match.id, match.homeGoals ?? NaN, e.target.value === '' ? NaN : Number(e.target.value))} />
                            </div>
                            <div>
                              <input type="datetime-local" className="px-2 py-1 rounded-md bg-transparent border border-white/20 w-full" value={match.dateISO ? new Date(match.dateISO).toISOString().slice(0,16) : ''} onChange={(e) => setDate(match.id, new Date(e.target.value).toISOString())} />
                            </div>
                            <div>
                              <Link 
                                to={`/tournaments/${tournament.id}/matches/${match.id}`}
                                className="px-3 py-1 rounded-md glass text-sm hover:bg-white/10 transition-all text-center block"
                                title="View match statistics"
                              >
                                📊 Stats
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 w-full max-w-6xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Fixtures</h2>
        {rounds.map((r) => (
          <div key={r.round} className="glass rounded-xl p-4">
            <div className="font-bold text-lg mb-4 text-center text-blue-400">Round {r.round + 1}</div>
            <div className="grid gap-3">
              {r.matchIds.map((mid) => {
                const m = tournament.matches.find((x) => x.id === mid)!
                return (
                  <div key={mid} className="grid md:grid-cols-6 gap-3 items-center p-3 glass rounded-lg">
                    {/* Home Team Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Home Team</label>
                      <select
                        value={m.homeTeamId || ''}
                        onChange={(e) => setPlayoffTeams(mid, e.target.value, m.awayTeamId || '')}
                        className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                      >
                        <option value="">Select Team</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* VS */}
                    <div className="text-center">
                      <div className="text-lg font-bold opacity-50">vs</div>
                    </div>

                    {/* Away Team Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Away Team</label>
                      <select
                        value={m.awayTeamId || ''}
                        onChange={(e) => setPlayoffTeams(mid, m.homeTeamId || '', e.target.value)}
                        className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                      >
                        <option value="">Select Team</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Score */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Score</label>
                      <div className="flex gap-1 items-center">
                        <input 
                          inputMode="numeric" 
                          pattern="[0-9]*" 
                          className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                          value={m.homeGoals ?? ''} 
                          onChange={(e) => setScore(mid, e.target.value === '' ? NaN : Number(e.target.value), m.awayGoals ?? NaN)} 
                        />
                        <span className="text-sm">:</span>
                        <input 
                          inputMode="numeric" 
                          pattern="[0-9]*" 
                          className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                          value={m.awayGoals ?? ''} 
                          onChange={(e) => setScore(mid, m.homeGoals ?? NaN, e.target.value === '' ? NaN : Number(e.target.value))} 
                        />
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Date & Time</label>
                      <input 
                        type="datetime-local" 
                        className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-xs" 
                        value={m.dateISO ? new Date(m.dateISO).toISOString().slice(0,16) : ''} 
                        onChange={(e) => setDate(mid, new Date(e.target.value).toISOString())} 
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Actions</label>
                      <Link 
                        to={`/tournaments/${tournament.id}/matches/${mid}`}
                        className="px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all text-center"
                        title="View match statistics"
                      >
                        📊 Stats
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Playoff Matches in Fixtures - Divided by Stage */}
        {playoffMatches.length > 0 && (
          <div className="space-y-6">
            {Array.from({ length: playoffStructure?.rounds || 0 }, (_, roundIndex) => {
              const roundMatches = playoffMatches.filter(m => m.playoffRound === roundIndex)
              const roundName = getPlayoffRoundName(roundIndex, playoffStructure?.rounds || 0)
              
              if (roundMatches.length === 0) return null
              
              return (
                <div key={roundIndex} className="glass rounded-xl p-4">
                  <div className="font-bold text-lg mb-4 text-center text-blue-400">{roundName}</div>
                  <div className="grid gap-3">
                    {roundMatches.map((m) => (
                      <div key={m.id} className="grid md:grid-cols-6 gap-3 items-center p-3 glass rounded-lg">
                        {/* Home Team Selection */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Home Team</label>
                          <select
                            value={m.homeTeamId || ''}
                            onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                            className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                          >
                            <option value="">Select Team</option>
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* VS */}
                        <div className="text-center">
                          <div className="text-lg font-bold opacity-50">vs</div>
                        </div>

                        {/* Away Team Selection */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Away Team</label>
                          <select
                            value={m.awayTeamId || ''}
                            onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                            className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                          >
                            <option value="">Select Team</option>
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Score */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Score</label>
                          <div className="flex gap-1 items-center">
                            <input 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                              value={m.homeGoals ?? ''} 
                              onChange={(e) => setScore(m.id, e.target.value === '' ? NaN : Number(e.target.value), m.awayGoals ?? NaN)} 
                            />
                            <span className="text-sm">:</span>
                            <input 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                              value={m.awayGoals ?? ''} 
                              onChange={(e) => setScore(m.id, m.homeGoals ?? NaN, e.target.value === '' ? NaN : Number(e.target.value))} 
                            />
                          </div>
                        </div>

                        {/* Date */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Date & Time</label>
                          <input 
                            type="datetime-local" 
                            className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-xs" 
                            value={m.dateISO ? new Date(m.dateISO).toISOString().slice(0,16) : ''} 
                            onChange={(e) => setDate(m.id, new Date(e.target.value).toISOString())} 
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Actions</label>
                          <Link 
                            to={`/tournaments/${tournament.id}/matches/${m.id}`}
                            className="px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all text-center"
                            title="View match statistics"
                          >
                            📊 Stats
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
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
  if (totalRounds === 6) {
    // Custom Playoff Homebush format
    const roundNames = [
      'Round 1 - Qualifiers & Elimination',
      'Round 2 - Elimination C',
      'Round 3 - Semi (Upper)',
      'Round 4 - Knockout',
      'Round 5 - Preliminary Finals',
      'Round 6 - Grand Final'
    ]
    return roundNames[roundIndex] || `Round ${roundIndex + 1}`
  }
  return `Round ${roundIndex + 1}`
}

