import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo, useState } from 'react'
import { generatePlayoffBrackets } from '../utils/schedule'
import { generateMatchUID } from '../utils/uid'
import { generateGroupsWithDivisionsSchedule } from '../utils/tournament'
import LocationIcon from '../components/LocationIcon'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import LogoUploader from '../components/LogoUploader'
import VisibilityToggle from '../components/VisibilityToggle'
import CustomDatePicker from '../components/CustomDatePicker'
import CustomTimePicker from '../components/CustomTimePicker'

export default function TournamentPage() {
  const { id } = useParams()
  const { getCurrentOrganizer, getOrganizerTournaments, getOrganizerTeams, updateTournament, deleteTournament, uploadTournamentLogo } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()
  const teams = getOrganizerTeams()
  
  // Find the specific tournament by ID
  const tournament = tournaments.find(t => t.id === id)
  
  // State for new round configuration
  const [showNewRoundForm, setShowNewRoundForm] = useState(false)
  const [newRoundConfig, setNewRoundConfig] = useState({
    name: '',
    quantityOfGames: 1,
    description: ''
  })
  
  // State for editing groups
  const [showEditGroups, setShowEditGroups] = useState(false)
  const [editingGroups, setEditingGroups] = useState<string[][]>([])
  
  // All useMemo hooks must be called before any early returns
  const rounds = useMemo(() => {
    if (!tournament) return [] as { round: number; matchIds: string[] }[]
    
    // Only include league matches (non-playoff matches)
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    
    // For groups_with_divisions, reorganize rounds like public page
    if (tournament.format?.mode === 'groups_with_divisions') {
      // Group matches by groupIndex first
      const matchesByGroup: Record<number, any[]> = {}
      leagueMatches.forEach(match => {
        const groupIndex = match.groupIndex || 1
        if (!matchesByGroup[groupIndex]) {
          matchesByGroup[groupIndex] = []
        }
        matchesByGroup[groupIndex].push(match)
      })
      
      // Sort matches within each group by their original round
      Object.keys(matchesByGroup).forEach(groupKey => {
        const groupIndex = Number(groupKey)
        matchesByGroup[groupIndex].sort((a, b) => (a.round || 0) - (b.round || 0))
      })
      
      // Reorganize into rounds: Round 1 = first match from each group, Round 2 = second match, etc.
      const groupMatchesByRound: Record<number, string[]> = {}
      const maxMatchesPerGroup = Math.max(...Object.values(matchesByGroup).map(matches => matches.length), 0)
      
      for (let roundIndex = 0; roundIndex < maxMatchesPerGroup; roundIndex++) {
        Object.keys(matchesByGroup).forEach(groupKey => {
          const groupIndex = Number(groupKey)
          const groupMatchesList = matchesByGroup[groupIndex]
          if (groupMatchesList[roundIndex]) {
            if (!groupMatchesByRound[roundIndex]) {
              groupMatchesByRound[roundIndex] = []
            }
            groupMatchesByRound[roundIndex].push(groupMatchesList[roundIndex].id)
          }
        })
      }
      
      return Object.entries(groupMatchesByRound)
        .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
        .sort((a, b) => a.round - b.round)
    }
    
    // Regular tournament format
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
            if (!tournament || !tournament.format || (tournament.format.mode !== 'league_playoff' && tournament.format.mode !== 'swiss_elimination' && tournament.format.mode !== 'league_custom_playoff')) return null
    
    if (tournament.format.mode === 'league_custom_playoff') {
      // League + Custom Playoff format
      const playoffTeams = tournament.format.customPlayoffConfig?.playoffTeams || 4
      const playoffRounds = tournament.format.customPlayoffConfig?.playoffRounds || []
      return {
        qualifiers: playoffTeams,
        rounds: playoffRounds.length, // Number of configured playoff rounds
        structure: [], // Custom playoff doesn't use standard bracket structure
        customRounds: playoffRounds // Custom round configurations
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

  const handleCompleteRound = () => {
    if (!tournament || !newRoundConfig.name.trim()) {
      alert('Please enter a round name')
      return
    }

    const newRound = {
      roundNumber: (tournament.format?.customPlayoffConfig?.playoffRounds?.length || 0) + 1,
      name: newRoundConfig.name.trim(),
      quantityOfGames: newRoundConfig.quantityOfGames,
      description: newRoundConfig.description.trim(),
      matches: Array.from({ length: newRoundConfig.quantityOfGames }, () => ({
        id: generateMatchUID(),
        isElimination: false
      }))
    }

    const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || []), newRound]
    updateTournament(tournament.id, {
      format: {
        rounds: tournament.format?.rounds || 1,
        mode: tournament.format?.mode || 'league',
        playoffQualifiers: tournament.format?.playoffQualifiers,
        customPlayoffConfig: {
          playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
          enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
          playoffRounds: updatedRounds
        }
      }
    })

    // Reset form
    setNewRoundConfig({
      name: '',
      quantityOfGames: 1,
      description: ''
    })
    setShowNewRoundForm(false)
  }

  const handleEndChampionship = () => {
    if (!tournament || !playoffStructure) return
    
    // Get current table standings
    const { table } = calculateTable()
    const qualifiedTeams = table.slice(0, playoffStructure.qualifiers)
    
    // Create playoff matches
    const playoffMatches = createPlayoffMatches(qualifiedTeams, tournament.id)
    
    // Update tournament with playoff matches
    updateTournament(tournament.id, {
      matches: [...tournament.matches, ...playoffMatches]
    })
  }

  const calculateTable = () => {
    if (!tournament) return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    
    // Check if this is a groups_with_divisions format
    if (tournament.format?.mode === 'groups_with_divisions' && tournament.format?.groupsWithDivisionsConfig) {
      let groups = tournament.format.groupsWithDivisionsConfig.groups
      
      // If groups aren't stored, reconstruct them from matches
      if (!groups || groups.length === 0) {
        const config = tournament.format.groupsWithDivisionsConfig
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // Reconstruct groups from match groupIndex
        const reconstructedGroups: Record<number, Set<string>> = {}
        tournament.matches.forEach(m => {
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
        
        // If we reconstructed groups, save them (only if they were missing)
        if (groups.length > 0 && groups.some(g => g.length > 0) && !tournament.format.groupsWithDivisionsConfig.groups) {
          tournament.format.groupsWithDivisionsConfig.groups = groups
          // Save updated format asynchronously to avoid blocking
          setTimeout(() => {
            updateTournament(tournament.id, { format: tournament.format }).catch(console.error)
          }, 0)
        }
      }
      
      if (groups && groups.length > 0) {
        const groupTables: Record<number, any[]> = {}
      
      // Calculate standings for each group separately
      groups.forEach((groupTeams, groupIndex) => {
        const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
        
        // Initialize stats for teams in this group
        groupTeams.forEach(tid => {
          stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        })
        
        // Count group matches (matches with this groupIndex)
        const groupMatches = tournament.matches.filter(m => 
          !m.isPlayoff && m.groupIndex === groupIndex + 1 &&
          groupTeams.includes(m.homeTeamId) && groupTeams.includes(m.awayTeamId)
        )
        
        for (const m of groupMatches) {
          if (m.homeGoals == null || m.awayGoals == null) continue
          const a = stats[m.homeTeamId]
          const b = stats[m.awayTeamId]
          if (!a || !b) continue
          
          a.p++; b.p++
          a.gf += m.homeGoals; a.ga += m.awayGoals
          b.gf += m.awayGoals; b.ga += m.homeGoals
          if (m.homeGoals > m.awayGoals) { a.w++; b.l++; a.pts += 3 }
          else if (m.homeGoals < m.awayGoals) { b.w++; a.l++; b.pts += 3 }
          else { a.d++; b.d++; a.pts++; b.pts++ }
        }
        
        const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
          .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
        
        groupTables[groupIndex + 1] = table
      })
      
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
      }
    
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    const eliminatedTeams = new Set<string>()
    
    for (const tid of tournament.teamIds) {
      stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
    }
    
    // Count league matches for the table
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
    
    // Also count playoff matches for points (3 win, 1 draw, 0 loss)
    const playoffMatchesList: any[] = []
    
    // Get regular playoff matches from tournament.matches
    if (tournament.matches && Array.isArray(tournament.matches)) {
      playoffMatchesList.push(...tournament.matches.filter(m => m.isPlayoff))
    }
    
    // For custom playoff format, also include matches from custom playoff configuration
    if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
      tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
        if (round.matches && Array.isArray(round.matches)) {
          // Check both match-level and round-level elimination flags
          const roundIsElimination = round.isElimination || false
          round.matches.forEach((match: any) => {
            const isEliminationMatch = match.isElimination || roundIsElimination
            const processedMatch = {
              ...match,
              isPlayoff: true,
              isElimination: isEliminationMatch, // Use combined elimination flag
              playoffRound: round.roundNumber || 0,
              roundName: round.name || '',
              roundDescription: round.description || ''
            }
            playoffMatchesList.push(processedMatch)
          })
        }
      })
    }
    
    for (const m of playoffMatchesList) {
      if (!m || m.homeGoals == null || m.awayGoals == null) continue
      if (m.homeTeamId === m.awayTeamId) continue // Skip BYE matches
      
      const a = stats[m.homeTeamId]
      const b = stats[m.awayTeamId]
      
      if (!a || !b) continue
      
      // Count all playoff matches for points (3 win, 1 draw, 0 loss)
      a.p++; b.p++
      a.gf += m.homeGoals; a.ga += m.awayGoals
      b.gf += m.awayGoals; b.ga += m.homeGoals
      
      if (m.homeGoals > m.awayGoals) { 
        a.w++; b.l++; a.pts += 3
        // Check if this is an elimination match and mark loser as eliminated
        if (m.isElimination) {
          eliminatedTeams.add(m.awayTeamId)
        }
      } else if (m.homeGoals < m.awayGoals) { 
        b.w++; a.l++; b.pts += 3
        // Check if this is an elimination match and mark loser as eliminated
        if (m.isElimination) {
          eliminatedTeams.add(m.homeTeamId)
        }
      } else { 
        a.d++; b.d++; a.pts++; b.pts++ 
      }
    }
    
    // For league_custom_playoff format, also check custom playoff rounds for elimination matches (double-check)
    if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
      tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
        // Check both match-level and round-level elimination flags
        const roundIsElimination = round.isElimination || false
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any) => {
            const matchIsElimination = match.isElimination || roundIsElimination
            if (matchIsElimination && match.homeGoals != null && match.awayGoals != null) {
              const homeTeamId = match.homeTeamId
              const awayTeamId = match.awayTeamId
              
              if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return
              
              // Mark the loser as eliminated
              if (match.homeGoals > match.awayGoals) {
                eliminatedTeams.add(awayTeamId)
              } else if (match.homeGoals < match.awayGoals) {
                eliminatedTeams.add(homeTeamId)
              }
            }
          })
        }
      })
    }
    
    const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
    
    return { table, eliminatedTeams, groupTables: {} }
  }

  const { table, eliminatedTeams, groupTables } = useMemo(() => calculateTable(), [tournament])

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
                   <LogoUploader 
                     onLogoUpload={(file) => uploadTournamentLogo(tournament.id, file)}
                     currentLogo={tournament.logo}
                     size={80}
                   />
                 </div>
                 <div>
        <h1 className="text-xl font-semibold">{tournament.name}</h1>
        <div className="text-sm opacity-70">{tournament.teamIds.length} teams • {tournament.matches.length} matches</div>
                 </div>
               </div>

               {/* Tournament Visibility */}
               <div className="mt-6 flex justify-center">
                 <div className="text-center">
                   <label className="block text-sm font-medium mb-3">Tournament Visibility</label>
                   <VisibilityToggle
                     isPublic={tournament.visibility !== 'private'}
                     onToggle={async (isPublic) => {
                       try {
                         await updateTournament(tournament.id, { 
                           visibility: isPublic ? 'public' : 'private' 
                         })
                       } catch (error) {
                         console.error('Failed to update tournament visibility:', error)
                         alert('Failed to update tournament visibility. Please try again.')
                       }
                     }}
                     size="medium"
                   />
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


      {/* Championship Table or Group Tables */}
      {tournament.format?.mode === 'groups_with_divisions' && (tournament.format?.groupsWithDivisionsConfig?.groups || tournament.format?.groupsWithDivisionsConfig) ? (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-wide">Group Tables</h2>
            <button
              onClick={() => {
                const groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
                setEditingGroups(groups.map(g => [...g])) // Deep copy
                setShowEditGroups(true)
              }}
              className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all text-sm"
            >
              ✏️ Edit Groups
            </button>
          </div>
          <p className="text-sm opacity-70 mb-4 text-center">
            Top 2 teams from each group advance to Division 1 playoffs. 3rd and 4th place go to Division 2 playoffs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(tournament.format.groupsWithDivisionsConfig.groups || []).map((_groupTeams, groupIndex) => {
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
                                  const team = teams.find(t => t.id === row.id)
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
                                  to={`/teams/${row.id}`}
                                  className="hover:opacity-80 transition-opacity text-xs"
                                >
                                  {teams.find(t => t.id === row.id)?.name ?? row.id}
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
            })}
          </div>
        </section>
      ) : null}
      
      {/* Group Editing Modal */}
      {showEditGroups && tournament?.format?.mode === 'groups_with_divisions' && (() => {
        // Get all teams in tournament
        const allTournamentTeams = tournament.teamIds || []
        // Get all teams currently assigned to groups
        const assignedTeamIds = new Set(editingGroups.flat())
        // Get unassigned teams
        const unassignedTeams = allTournamentTeams.filter(teamId => !assignedTeamIds.has(teamId))
        
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditGroups(false)}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Edit Groups</h2>
              <button
                onClick={() => setShowEditGroups(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-all text-white"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-sm text-gray-300 mb-4">
              Drag teams between groups or click to move teams. Changes will regenerate group matches.
            </p>
            
            {/* Available Teams Section */}
            {unassignedTeams.length > 0 && (
              <div className="mb-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                <h3 className="font-semibold mb-2 text-white">Available Teams ({unassignedTeams.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedTeams.map((teamId) => {
                    const team = teams.find(t => t.id === teamId)
                    return (
                      <div
                        key={teamId}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 cursor-pointer"
                        onClick={() => {
                          // Add to first group that has space
                          const newGroups = [...editingGroups]
                          const maxTeamsPerGroup = tournament?.format?.groupsWithDivisionsConfig?.teamsPerGroup || 4
                          for (let i = 0; i < newGroups.length; i++) {
                            if (newGroups[i].length < maxTeamsPerGroup) {
                              newGroups[i] = [...newGroups[i], teamId]
                              setEditingGroups(newGroups)
                              break
                            }
                          }
                        }}
                      >
                        {team?.logo ? (
                          <img src={team.logo} alt={team.name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                        )}
                        <span className="text-sm text-white">{team?.name || teamId}</span>
                        <span className="text-xs text-gray-400">Click to add</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {editingGroups.map((groupTeams, groupIndex) => {
                const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
                const maxTeamsPerGroup = tournament?.format?.groupsWithDivisionsConfig?.teamsPerGroup || 4
                const hasSpace = groupTeams.length < maxTeamsPerGroup
                
                return (
                <div key={groupIndex} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <h3 className="font-semibold mb-2 text-white">Group {groupLetter}</h3>
                  <div className="space-y-2 min-h-[200px] bg-slate-800 rounded p-2 border border-slate-700">
                    {groupTeams.map((teamId) => {
                      const team = teams.find(t => t.id === teamId)
                      return (
                        <div
                          key={teamId}
                          className="flex items-center gap-2 p-2 bg-slate-700 rounded hover:bg-slate-600 cursor-move"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('teamId', teamId)
                            e.dataTransfer.setData('sourceGroup', groupIndex.toString())
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const draggedTeamId = e.dataTransfer.getData('teamId')
                            const sourceGroupIndex = parseInt(e.dataTransfer.getData('sourceGroup'))
                            
                            if (sourceGroupIndex !== groupIndex && draggedTeamId) {
                              const newGroups = [...editingGroups]
                              newGroups[sourceGroupIndex] = newGroups[sourceGroupIndex].filter(id => id !== draggedTeamId)
                              newGroups[groupIndex] = [...newGroups[groupIndex], draggedTeamId]
                              setEditingGroups(newGroups)
                            }
                          }}
                        >
                          {team?.logo ? (
                            <img src={team.logo} alt={team.name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="w-6 h-6 rounded-full inline-block" style={{ background: team?.colors?.[0] || '#3B82F6' }} />
                          )}
                          <span className="flex-1 text-white">{team?.name || teamId}</span>
                          <button
                            onClick={() => {
                              const newGroups = [...editingGroups]
                              newGroups[groupIndex] = newGroups[groupIndex].filter(id => id !== teamId)
                              setEditingGroups(newGroups)
                            }}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                    {hasSpace && (
                      <div className="p-2 text-center text-sm text-gray-400 border-2 border-dashed border-slate-600 rounded">
                        Drop teams here or click available teams above
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {groupTeams.length} / {maxTeamsPerGroup} teams
                  </div>
                </div>
                )
              })}
            </div>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowEditGroups(false)}
                className="px-6 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 transition-all text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!tournament) return
                  
                  // Regenerate matches with new groups
                  const config = tournament.format?.groupsWithDivisionsConfig
                  if (!config) return
                  
                  const result = generateGroupsWithDivisionsSchedule(tournament.teamIds, {
                    numberOfGroups: config.numberOfGroups,
                    teamsPerGroup: config.teamsPerGroup,
                    groupRounds: config.groupRounds,
                    existingGroups: editingGroups
                  })
                  
                  // Update tournament with new groups and matches
                  if (tournament.format) {
                    await updateTournament(tournament.id, {
                      matches: result.matches,
                      format: {
                        ...tournament.format,
                        groupsWithDivisionsConfig: {
                          ...config,
                          groups: result.groups
                        }
                      }
                    })
                  }
                  
                  setShowEditGroups(false)
                }}
                className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 transition-all text-white font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
        )
      })()}
      
      {tournament.format?.mode !== 'groups_with_divisions' && (
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
                  const isEliminated = eliminatedTeams.has(row.id)
                  
                  return (
                    <tr key={row.id} className={`border-t border-white/10 ${isQualified ? 'bg-green-500/10' : ''} ${isEliminated ? 'bg-red-500/20 opacity-70' : ''}`}>
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
      )}

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
                            <div className="flex gap-2">
                              <CustomDatePicker
                                value={match.dateISO ? match.dateISO.split('T')[0] : ''}
                                onChange={(date) => {
                                  const currentTime = match.dateISO ? new Date(match.dateISO).toTimeString().slice(0, 5) : '12:00'
                                  setDate(match.id, new Date(`${date}T${currentTime}`).toISOString())
                                }}
                                className="flex-1"
                                placeholder="Select Date"
                              />
                              <CustomTimePicker
                                value={match.dateISO ? new Date(match.dateISO).toTimeString().slice(0, 5) : '12:00'}
                                onChange={(time) => {
                                  const currentDate = match.dateISO ? match.dateISO.split('T')[0] : new Date().toISOString().split('T')[0]
                                  setDate(match.id, new Date(`${currentDate}T${time}`).toISOString())
                                }}
                                className="w-24"
                                placeholder="Time"
                              />
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

                    {/* Date & Time */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Date & Time</label>
                      <div className="flex gap-2">
                        <CustomDatePicker
                          value={m.dateISO ? new Date(m.dateISO).toISOString().split('T')[0] : ''}
                          onChange={(date) => {
                            const newDate = date ? new Date(date) : new Date()
                            // Preserve time if it exists, otherwise set to 12:00
                            if (m.dateISO) {
                              const time = new Date(m.dateISO)
                              newDate.setHours(time.getHours(), time.getMinutes())
                            } else {
                              newDate.setHours(12, 0)
                            }
                            setDate(mid, newDate.toISOString())
                          }}
                          className="flex-1 text-xs"
                          placeholder="Select Date"
                        />
                        <CustomTimePicker
                          value={m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'}
                          onChange={(time) => {
                            const currentDate = m.dateISO ? new Date(m.dateISO) : new Date()
                            const [hours, minutes] = time.split(':').map(Number)
                            currentDate.setHours(hours || 12, minutes || 0)
                            setDate(mid, currentDate.toISOString())
                          }}
                          className="w-24 text-xs"
                          placeholder="Time"
                        />
                      </div>
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

        {/* Custom Playoff Configuration */}
        {tournament.format?.mode === 'league_custom_playoff' && (
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-center mb-4">Custom Playoff Configuration</h2>
            <div className="space-y-6">
              <p className="text-center text-sm opacity-80">
                Configure your playoff rounds. Set the quantity of games and mark individual matches as elimination.
              </p>
              
              {/* Add New Round Form */}
              {!showNewRoundForm && (
                <div className="text-center">
                  <button
                    onClick={() => setShowNewRoundForm(true)}
                    className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
                  >
                    ➕ Add Playoff Round
                  </button>
                </div>
              )}

              {/* New Round Configuration Form */}
              {showNewRoundForm && (
                <div className="glass rounded-lg p-4 border border-white/20">
                  <h3 className="text-md font-semibold mb-4">Configure New Playoff Round</h3>
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Round Name</label>
                      <input
                        type="text"
                        value={newRoundConfig.name}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, name: e.target.value })}
                        placeholder="e.g., Semi-Finals, Final"
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity of Games</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newRoundConfig.quantityOfGames}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, quantityOfGames: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        value={newRoundConfig.description}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, description: e.target.value })}
                        placeholder="e.g., Top 4 teams advance"
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleCompleteRound}
                      className="px-6 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 transition-all text-green-400"
                    >
                      ✅ Complete
                    </button>
                    <button
                      onClick={() => setShowNewRoundForm(false)}
                      className="px-6 py-2 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 transition-all text-gray-400"
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Configured Rounds */}
              {tournament.format?.customPlayoffConfig?.playoffRounds?.map((round, roundIndex) => {
                // Ensure round has quantityOfGames property for backward compatibility
                const roundWithQuantity = {
                  ...round,
                  quantityOfGames: round.quantityOfGames ?? (round.matches?.length || 1),
                  matches: round.matches || []
                }
                
                return (
                <div key={roundIndex} className="p-6 glass rounded-lg border border-white/10">
                  <div className="space-y-4">
                    {/* Round Header */}
                    <div className="grid md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium mb-1">Round Name</label>
                        <input
                          type="text"
                          value={roundWithQuantity.name}
                          onChange={(e) => {
                            const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                            updatedRounds[roundIndex] = { ...roundWithQuantity, name: e.target.value }
                            updateTournament(tournament.id, {
                              format: {
                                rounds: tournament.format?.rounds || 1,
                                mode: tournament.format?.mode || 'league',
                                playoffQualifiers: tournament.format?.playoffQualifiers,
                                customPlayoffConfig: {
                                  playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                  enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                  playoffRounds: updatedRounds
                                }
                              }
                            })
                          }}
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Quantity of Games</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={roundWithQuantity.quantityOfGames ?? 1}
                          onChange={(e) => {
                            const inputValue = e.target.value
                            const quantity = inputValue === '' ? 1 : Math.max(1, Math.min(20, parseInt(inputValue) || 1))
                            const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                            
                            // Generate or remove matches based on quantity
                            let matches = [...(roundWithQuantity.matches || [])]
                            if (quantity > matches.length) {
                              // Add new matches
                              for (let i = matches.length; i < quantity; i++) {
                                matches.push({
                                  id: generateMatchUID(),
                                  isElimination: false
                                })
                              }
                            } else if (quantity < matches.length) {
                              // Remove excess matches
                              matches = matches.slice(0, quantity)
                            }
                            
                            updatedRounds[roundIndex] = { ...roundWithQuantity, quantityOfGames: quantity, matches }
                            updateTournament(tournament.id, {
                              format: {
                                rounds: tournament.format?.rounds || 1,
                                mode: tournament.format?.mode || 'league',
                                playoffQualifiers: tournament.format?.playoffQualifiers,
                                customPlayoffConfig: {
                                  playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                  enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                  playoffRounds: updatedRounds
                                }
                              }
                            })
                          }}
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                        <input
                          type="text"
                          value={roundWithQuantity.description || ''}
                          onChange={(e) => {
                            const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                            updatedRounds[roundIndex] = { ...roundWithQuantity, description: e.target.value }
                            updateTournament(tournament.id, {
                              format: {
                                rounds: tournament.format?.rounds || 1,
                                mode: tournament.format?.mode || 'league',
                                playoffQualifiers: tournament.format?.playoffQualifiers,
                                customPlayoffConfig: {
                                  playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                  enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                  playoffRounds: updatedRounds
                                }
                              }
                            })
                          }}
                          placeholder="e.g., Semi-Finals, Final, etc."
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const updatedRounds = tournament.format?.customPlayoffConfig?.playoffRounds?.filter((_, i) => i !== roundIndex) || []
                            updateTournament(tournament.id, {
                              format: {
                                rounds: tournament.format?.rounds || 1,
                                mode: tournament.format?.mode || 'league',
                                playoffQualifiers: tournament.format?.playoffQualifiers,
                                customPlayoffConfig: {
                                  playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                  enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                  playoffRounds: updatedRounds
                                }
                              }
                            })
                          }}
                          className="px-3 py-2 rounded-md bg-red-500/20 hover:bg-red-500/30 transition-all text-red-400"
                        >
                          🗑️ Delete Round
                        </button>
                      </div>
                    </div>

                    {/* Individual Matches */}
                    {roundWithQuantity.matches && roundWithQuantity.matches.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-md font-medium mb-3">Matches in this Round:</h4>
                        <div className="grid gap-3">
                          {roundWithQuantity.matches.map((match, matchIndex) => (
                            <div key={match.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                              <div className="grid md:grid-cols-9 gap-4 items-center">
                                <div className="md:col-span-2">
                                  <label className="block text-sm font-medium mb-1">Home Team</label>
                                  <select
                                    value={match.homeTeamId || ''}
                                    onChange={(e) => {
                                      const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                      const updatedMatches = [...(roundWithQuantity.matches || [])]
                                      updatedMatches[matchIndex] = { ...match, homeTeamId: e.target.value }
                                      updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                      updateTournament(tournament.id, {
                                        format: {
                                          rounds: tournament.format?.rounds || 1,
                                          mode: tournament.format?.mode || 'league',
                                          playoffQualifiers: tournament.format?.playoffQualifiers,
                                          customPlayoffConfig: {
                                            playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                            enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                            playoffRounds: updatedRounds
                                          }
                                        }
                                      })
                                    }}
                                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                                  >
                                    <option value="">Select Team</option>
                                    {teams.map(team => (
                                      <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-sm font-medium mb-1">Away Team</label>
                                  <select
                                    value={match.awayTeamId || ''}
                                    onChange={(e) => {
                                      const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                      const updatedMatches = [...(roundWithQuantity.matches || [])]
                                      updatedMatches[matchIndex] = { ...match, awayTeamId: e.target.value }
                                      updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                      updateTournament(tournament.id, {
                                        format: {
                                          rounds: tournament.format?.rounds || 1,
                                          mode: tournament.format?.mode || 'league',
                                          playoffQualifiers: tournament.format?.playoffQualifiers,
                                          customPlayoffConfig: {
                                            playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                            enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                            playoffRounds: updatedRounds
                                          }
                                        }
                                      })
                                    }}
                                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                                  >
                                    <option value="">Select Team</option>
                                    {teams.map(team => (
                                      <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Score</label>
                                  <div className="flex gap-1 items-center">
                                    <input 
                                      inputMode="numeric" 
                                      pattern="[0-9]*" 
                                      className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                      value={match.homeGoals ?? ''} 
                                      onChange={(e) => {
                                        const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                        const updatedMatches = [...(roundWithQuantity.matches || [])]
                                        const homeGoals = e.target.value === '' ? undefined : Number(e.target.value)
                                        updatedMatches[matchIndex] = { ...match, homeGoals: isNaN(homeGoals as number) ? undefined : homeGoals }
                                        updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                        updateTournament(tournament.id, {
                                          format: {
                                            rounds: tournament.format?.rounds || 1,
                                            mode: tournament.format?.mode || 'league',
                                            playoffQualifiers: tournament.format?.playoffQualifiers,
                                            customPlayoffConfig: {
                                              playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                              enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                              playoffRounds: updatedRounds
                                            }
                                          }
                                        })
                                      }}
                                    />
                                    <span className="text-sm">:</span>
                                    <input 
                                      inputMode="numeric" 
                                      pattern="[0-9]*" 
                                      className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                      value={match.awayGoals ?? ''} 
                                      onChange={(e) => {
                                        const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                        const updatedMatches = [...(roundWithQuantity.matches || [])]
                                        const awayGoals = e.target.value === '' ? undefined : Number(e.target.value)
                                        updatedMatches[matchIndex] = { ...match, awayGoals: isNaN(awayGoals as number) ? undefined : awayGoals }
                                        updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                        updateTournament(tournament.id, {
                                          format: {
                                            rounds: tournament.format?.rounds || 1,
                                            mode: tournament.format?.mode || 'league',
                                            playoffQualifiers: tournament.format?.playoffQualifiers,
                                            customPlayoffConfig: {
                                              playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                              enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                              playoffRounds: updatedRounds
                                            }
                                          }
                                        })
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Date</label>
                                  <CustomDatePicker
                                    value={match.dateISO ? match.dateISO.split('T')[0] : ''}
                                    onChange={(date) => {
                                      const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                      const updatedMatches = [...(roundWithQuantity.matches || [])]
                                      updatedMatches[matchIndex] = { ...match, dateISO: date ? `${date}T00:00:00.000Z` : undefined }
                                      updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                      updateTournament(tournament.id, {
                                        format: {
                                          rounds: tournament.format?.rounds || 1,
                                          mode: tournament.format?.mode || 'league',
                                          playoffQualifiers: tournament.format?.playoffQualifiers,
                                          customPlayoffConfig: {
                                            playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                            enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                            playoffRounds: updatedRounds
                                          }
                                        }
                                      })
                                    }}
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Time</label>
                                  <CustomTimePicker
                                    value={match.time || ''}
                                    onChange={(time) => {
                                      const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                      const updatedMatches = [...(roundWithQuantity.matches || [])]
                                      updatedMatches[matchIndex] = { ...match, time: time }
                                      updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                      updateTournament(tournament.id, {
                                        format: {
                                          rounds: tournament.format?.rounds || 1,
                                          mode: tournament.format?.mode || 'league',
                                          playoffQualifiers: tournament.format?.playoffQualifiers,
                                          customPlayoffConfig: {
                                            playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                            enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                            playoffRounds: updatedRounds
                                          }
                                        }
                                      })
                                    }}
                                    className="w-full"
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={match.isElimination}
                                      onChange={(e) => {
                                        const updatedRounds = [...(tournament.format?.customPlayoffConfig?.playoffRounds || [])]
                                        const updatedMatches = [...(roundWithQuantity.matches || [])]
                                        updatedMatches[matchIndex] = { ...match, isElimination: e.target.checked }
                                        updatedRounds[roundIndex] = { ...roundWithQuantity, matches: updatedMatches }
                                        updateTournament(tournament.id, {
                                          format: {
                                            rounds: tournament.format?.rounds || 1,
                                            mode: tournament.format?.mode || 'league',
                                            playoffQualifiers: tournament.format?.playoffQualifiers,
                                            customPlayoffConfig: {
                                              playoffTeams: tournament.format?.customPlayoffConfig?.playoffTeams || 4,
                                              enableBye: tournament.format?.customPlayoffConfig?.enableBye || true,
                                              playoffRounds: updatedRounds
                                            }
                                          }
                                        })
                                      }}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-sm text-red-400">🔥 Elimination</span>
                                  </label>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => {
                                      // Navigate to match page for stats
                                      window.open(`/public/tournaments/${tournament.id}/matches/${match.id}`, '_blank')
                                    }}
                                    className="px-3 py-2 rounded-md bg-blue-500/20 hover:bg-blue-500/30 transition-all text-blue-400 text-sm"
                                    disabled={!match.homeTeamId || !match.awayTeamId}
                                    title={!match.homeTeamId || !match.awayTeamId ? 'Select teams first' : 'View match stats'}
                                  >
                                    📊 Stats
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )
              }) || []}

            </div>
          </div>
        )}

        {/* Playoff Matches in Fixtures - Divided by Stage */}
        {playoffMatches.length > 0 && (
          <div className="space-y-6">
            {(() => {
              // For groups_with_divisions, organize playoffs by division
              if (tournament.format?.mode === 'groups_with_divisions') {
                const div1Matches: any[] = []
                const div2Matches: any[] = []
                
                playoffMatches.forEach(m => {
                  if (m.division === 1) {
                    div1Matches.push(m)
                  } else if (m.division === 2) {
                    div2Matches.push(m)
                  }
                })
                
                // Group by round for each division
                const div1ByRound: Record<number, any[]> = {}
                const div2ByRound: Record<number, any[]> = {}
                
                div1Matches.forEach(m => {
                  const round = m.playoffRound !== undefined ? m.playoffRound : (m.round || 0)
                  if (!div1ByRound[round]) div1ByRound[round] = []
                  div1ByRound[round].push(m)
                })
                
                div2Matches.forEach(m => {
                  const round = m.playoffRound !== undefined ? m.playoffRound : (m.round || 0)
                  if (!div2ByRound[round]) div2ByRound[round] = []
                  div2ByRound[round].push(m)
                })
                
                const div1Rounds = Object.keys(div1ByRound).map(Number).sort((a, b) => a - b)
                const div2Rounds = Object.keys(div2ByRound).map(Number).sort((a, b) => a - b)
                const totalDiv1Rounds = div1Rounds.length
                const totalDiv2Rounds = div2Rounds.length
                
                return (
                  <>
                    {/* Division 1 Playoffs */}
                    {div1Rounds.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-xl font-bold mb-4 text-green-400">Division 1 Playoffs</h3>
                        {div1Rounds.map(roundIndex => {
                          const roundMatches = div1ByRound[roundIndex] || []
                          const roundName = getPlayoffRoundName(roundIndex, totalDiv1Rounds)
                          
                          return (
                            <div key={`div1-${roundIndex}`} className="mb-6">
                              <div className="glass rounded-xl p-4 border border-green-500/20">
                                <div className="font-bold text-lg mb-4 text-center text-green-400">Division 1 - {roundName}</div>
                                <div className="grid gap-3">
                                  {roundMatches.map((m) => (
                                    <div key={m.id} className="grid md:grid-cols-6 gap-3 items-center p-3 glass rounded-lg">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Home Team</label>
                                        <select
                                          value={m.homeTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-bold opacity-50">vs</div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Away Team</label>
                                        <select
                                          value={m.awayTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
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
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Date & Time</label>
                                        <div className="flex gap-2">
                                          <CustomDatePicker
                                            value={m.dateISO ? m.dateISO.split('T')[0] : ''}
                                            onChange={(date) => {
                                              const currentTime = m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'
                                              setDate(m.id, new Date(`${date}T${currentTime}`).toISOString())
                                            }}
                                            className="flex-1 text-xs"
                                            placeholder="Select Date"
                                          />
                                          <CustomTimePicker
                                            value={m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'}
                                            onChange={(time) => {
                                              const currentDate = m.dateISO ? m.dateISO.split('T')[0] : new Date().toISOString().split('T')[0]
                                              setDate(m.id, new Date(`${currentDate}T${time}`).toISOString())
                                            }}
                                            className="w-24 text-xs"
                                            placeholder="Time"
                                          />
                                        </div>
                                      </div>
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
                            </div>
                          )
                        })}
                      </div>
                    )}
                    
                    {/* Division 2 Playoffs */}
                    {div2Rounds.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-xl font-bold mb-4 text-blue-400">Division 2 Playoffs</h3>
                        {div2Rounds.map(roundIndex => {
                          const roundMatches = div2ByRound[roundIndex] || []
                          const roundName = getPlayoffRoundName(roundIndex, totalDiv2Rounds)
                          
                          return (
                            <div key={`div2-${roundIndex}`} className="mb-6">
                              <div className="glass rounded-xl p-4 border border-blue-500/20">
                                <div className="font-bold text-lg mb-4 text-center text-blue-400">Division 2 - {roundName}</div>
                                <div className="grid gap-3">
                                  {roundMatches.map((m) => (
                                    <div key={m.id} className="grid md:grid-cols-6 gap-3 items-center p-3 glass rounded-lg">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Home Team</label>
                                        <select
                                          value={m.homeTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-bold opacity-50">vs</div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Away Team</label>
                                        <select
                                          value={m.awayTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {teams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
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
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Date & Time</label>
                                        <div className="flex gap-2">
                                          <CustomDatePicker
                                            value={m.dateISO ? m.dateISO.split('T')[0] : ''}
                                            onChange={(date) => {
                                              const currentTime = m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'
                                              setDate(m.id, new Date(`${date}T${currentTime}`).toISOString())
                                            }}
                                            className="flex-1 text-xs"
                                            placeholder="Select Date"
                                          />
                                          <CustomTimePicker
                                            value={m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'}
                                            onChange={(time) => {
                                              const currentDate = m.dateISO ? m.dateISO.split('T')[0] : new Date().toISOString().split('T')[0]
                                              setDate(m.id, new Date(`${currentDate}T${time}`).toISOString())
                                            }}
                                            className="w-24 text-xs"
                                            placeholder="Time"
                                          />
                                        </div>
                                      </div>
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
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              }
              
              // Regular playoff display for other formats
              return Array.from({ length: playoffStructure?.rounds || 0 }, (_, roundIndex) => {
                const roundMatches = playoffMatches.filter(m => m.playoffRound === roundIndex)
                const roundName = playoffStructure?.customRounds?.[roundIndex]?.name || 
                                 getPlayoffRoundName(roundIndex, playoffStructure?.rounds || 0)
                
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
                          <div className="flex gap-2">
                            <CustomDatePicker
                              value={m.dateISO ? m.dateISO.split('T')[0] : ''}
                              onChange={(date) => {
                                const currentTime = m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'
                                setDate(m.id, new Date(`${date}T${currentTime}`).toISOString())
                              }}
                              className="flex-1 text-xs"
                              placeholder="Select Date"
                            />
                            <CustomTimePicker
                              value={m.dateISO ? new Date(m.dateISO).toTimeString().slice(0, 5) : '12:00'}
                              onChange={(time) => {
                                const currentDate = m.dateISO ? m.dateISO.split('T')[0] : new Date().toISOString().split('T')[0]
                                setDate(m.id, new Date(`${currentDate}T${time}`).toISOString())
                              }}
                              className="w-24 text-xs"
                              placeholder="Time"
                            />
                          </div>
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
            })
            })()}
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
  // For custom playoff rounds, use the configured names
  if (totalRounds > 0 && totalRounds <= 10) {
    // This will be handled by the custom round names from playoffStructure.customRounds
    return `Round ${roundIndex + 1}`
  }
  return `Round ${roundIndex + 1}`
}

