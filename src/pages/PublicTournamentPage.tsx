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
  // Removed expensive 10-second refresh - cache handles this efficiently
  useEffect(() => {
    const loadData = async () => {
      try {
        // Check if data is already available in store before loading
        const existingTournaments = getAllTournaments()
        const existingTeams = getAllTeams()
        
        // Only load if we don't have data or cache is stale
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
    
    // Only refresh when page becomes visible AND cache is likely stale (after 5 minutes)
    // This prevents unnecessary reloads when cache is still fresh
    let lastVisibilityChange = Date.now()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        // Only refresh if it's been more than 5 minutes since last check
        // This respects the 30-minute cache TTL
        if (now - lastVisibilityChange > 5 * 60 * 1000) {
          const existingTournaments = getAllTournaments()
          const existingTeams = getAllTeams()
          // Only reload if we don't have data
          if (existingTournaments.length === 0 || existingTeams.length === 0) {
            loadData()
          }
          lastVisibilityChange = now
        }
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
        matches: t.matches?.length || 0,
        formatMode: t.format?.mode,
        hasCustomPlayoff: !!t.format?.customPlayoffConfig,
        playoffRoundsCount: t.format?.customPlayoffConfig?.playoffRounds?.length || 0
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
    
    // Log the found tournament's format details
    if (tournament) {
      console.log('🎯 PublicTournamentPage: Found tournament format details:', {
        id: tournament.id,
        name: tournament.name,
        formatMode: tournament.format?.mode,
        hasFormat: !!tournament.format,
        hasGroupsWithDivisionsConfig: !!tournament.format?.groupsWithDivisionsConfig,
        groupsWithDivisionsConfig: tournament.format?.groupsWithDivisionsConfig,
        hasCustomPlayoffConfig: !!tournament.format?.customPlayoffConfig,
        playoffRounds: tournament.format?.customPlayoffConfig?.playoffRounds,
        playoffRoundsLength: tournament.format?.customPlayoffConfig?.playoffRounds?.length,
        fullFormat: tournament.format,
        teamIdsCount: tournament.teamIds?.length || 0,
        matchesCount: tournament.matches?.length || 0
      })
    }
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
    console.log('🔍 PublicTournamentPage: playoffMatches useMemo called')
    
    if (!tournament) {
      console.log('❌ PublicTournamentPage: No tournament found')
      return []
    }
    
    console.log('✅ PublicTournamentPage: Tournament found:', {
      id: tournament.id,
      format: tournament.format,
      formatMode: tournament.format?.mode,
      customPlayoffConfig: tournament.format?.customPlayoffConfig,
      playoffRounds: tournament.format?.customPlayoffConfig?.playoffRounds,
      playoffRoundsLength: tournament.format?.customPlayoffConfig?.playoffRounds?.length
    })
    
    console.log('📊 PublicTournamentPage: Full tournament object:', tournament)
    console.log('🎯 PublicTournamentPage: Tournament format mode:', tournament.format?.mode)
    console.log('⚙️ PublicTournamentPage: Has custom playoff config:', !!tournament.format?.customPlayoffConfig)
    console.log('📋 PublicTournamentPage: Custom playoff rounds:', tournament.format?.customPlayoffConfig?.playoffRounds)
    
    try {
      let matches = []
      
      // Get playoff matches from tournament.matches
      if (tournament.matches && Array.isArray(tournament.matches)) {
        matches = tournament.matches.filter((m: any) => m && m.isPlayoff)
        console.log('PublicTournamentPage: Regular playoff matches found:', matches.length)
      }
      
      // For custom playoff format, also include matches from custom playoff configuration
      console.log('🔍 PublicTournamentPage: Checking custom playoff condition:', {
        mode: tournament.format?.mode,
        isLeagueCustomPlayoff: tournament.format?.mode === 'league_custom_playoff',
        hasCustomPlayoffConfig: !!tournament.format?.customPlayoffConfig,
        hasPlayoffRounds: !!tournament.format?.customPlayoffConfig?.playoffRounds,
        playoffRoundsLength: tournament.format?.customPlayoffConfig?.playoffRounds?.length
      })
      
      if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
        console.log('✅ PublicTournamentPage: Processing custom playoff rounds:', tournament.format.customPlayoffConfig.playoffRounds.length)
        console.log('📋 PublicTournamentPage: Full playoffRounds array:', tournament.format.customPlayoffConfig.playoffRounds)
        const customPlayoffMatches: any[] = []
        tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any, roundIndex: number) => {
          console.log(`🔍 PublicTournamentPage: Processing round ${roundIndex}:`, {
            roundName: round.name,
            roundDescription: round.description,
            matches: round.matches,
            matchesLength: round.matches?.length,
            matchesIsArray: Array.isArray(round.matches),
            fullRound: round
          })
          if (round.matches && Array.isArray(round.matches)) {
            console.log(`✅ PublicTournamentPage: Round ${roundIndex} has ${round.matches.length} matches`)
            round.matches.forEach((match: any) => {
              console.log(`PublicTournamentPage: Match ${match.id} - homeGoals: ${match.homeGoals} (type: ${typeof match.homeGoals}), awayGoals: ${match.awayGoals} (type: ${typeof match.awayGoals})`, match)
              // Ensure scores are numbers if they exist - convert strings to numbers
              let homeGoals: number | undefined = undefined
              let awayGoals: number | undefined = undefined
              
              // Convert scores to numbers, handling all possible formats
              if (match.homeGoals != null && match.homeGoals !== '') {
                const converted = Number(match.homeGoals)
                if (!isNaN(converted)) {
                  homeGoals = converted
                }
              }
              
              if (match.awayGoals != null && match.awayGoals !== '') {
                const converted = Number(match.awayGoals)
                if (!isNaN(converted)) {
                  awayGoals = converted
                }
              }
              
              // Create match object with scores explicitly set (even if undefined)
              const processedMatch = {
                ...match,
                homeGoals: homeGoals !== undefined ? homeGoals : match.homeGoals, // Fallback to original if conversion failed
                awayGoals: awayGoals !== undefined ? awayGoals : match.awayGoals, // Fallback to original if conversion failed
                playoffRound: roundIndex,
                isPlayoff: true,
                roundName: round.name,
                roundDescription: round.description
              }
              
              console.log(`PublicTournamentPage: Processed match ${processedMatch.id}:`, {
                originalHomeGoals: match.homeGoals,
                originalAwayGoals: match.awayGoals,
                processedHomeGoals: processedMatch.homeGoals,
                processedAwayGoals: processedMatch.awayGoals
              })
              
              customPlayoffMatches.push(processedMatch)
            })
          }
        })
        console.log('✅ PublicTournamentPage: Custom playoff matches created:', customPlayoffMatches.length)
        console.log('📊 PublicTournamentPage: Sample match with scores:', customPlayoffMatches.find(m => m.homeGoals != null || m.awayGoals != null))
        matches = [...matches, ...customPlayoffMatches]
      } else {
        console.log('❌ PublicTournamentPage: Custom playoff condition NOT met - matches not processed')
      }
      
      console.log('📈 PublicTournamentPage: Total playoff matches:', matches.length)
      console.log('🎯 PublicTournamentPage: Returning playoff matches:', matches)
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
      return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    }
    
    try {
      // Check if this is a groups_with_divisions format
      // Also check if matches have groupIndex (indicates groups format even if format.mode isn't set)
      const hasGroupMatches = tournament.matches.some((m: any) => m.groupIndex && !m.isPlayoff)
      const hasGroupsConfig = !!tournament.format?.groupsWithDivisionsConfig
      const teamCount = tournament.teamIds.length
      // If we have groupsWithDivisionsConfig, treat it as groups format even if mode isn't set
      const isGroupsFormat = tournament.format?.mode === 'groups_with_divisions' || hasGroupMatches || hasGroupsConfig
      
      console.log('🔍 calculateTable - Format detection:', {
        formatMode: tournament.format?.mode,
        hasGroupMatches,
        hasGroupsConfig,
        teamCount,
        isGroupsFormat,
        groupsConfig: tournament.format?.groupsWithDivisionsConfig
      })
      
      if (isGroupsFormat) {
        // Get or create config
        let config = tournament.format?.groupsWithDivisionsConfig
        if (!config) {
          // If config doesn't exist, try to infer from matches or create default
          const groupIndices = new Set<number>()
          tournament.matches.forEach((m: any) => {
            if (m.groupIndex && !m.isPlayoff) {
              groupIndices.add(m.groupIndex)
            }
          })
          
          const numberOfGroups = groupIndices.size > 0 ? groupIndices.size : 4
          const teamCount = tournament.teamIds.length
          const teamsPerGroup = Math.ceil(teamCount / numberOfGroups)
          
          config = {
            numberOfGroups,
            teamsPerGroup,
            groupRounds: 1
          }
          
          // Ensure format object exists
          if (!tournament.format) {
            tournament.format = { mode: 'groups_with_divisions', rounds: 1 }
          }
          tournament.format.mode = 'groups_with_divisions'
          tournament.format.groupsWithDivisionsConfig = config
        }
        
        let groups = config.groups || []
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // If groups aren't stored, reconstruct them from matches or teamIds
        if (!groups || groups.length === 0) {
          // Try to reconstruct from match groupIndex first
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
            if (reconstructedGroups[i] && reconstructedGroups[i].size > 0) {
              groups.push(Array.from(reconstructedGroups[i]))
            } else {
              // Fallback: distribute teams evenly
              const startIdx = (i - 1) * teamsPerGroup
              const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
              groups.push(tournament.teamIds.slice(startIdx, endIdx))
            }
          }
        }
        
        // Always calculate group tables, even if groups are empty (will show empty tables)
        const groupTables: Record<number, any[]> = {}
        
        // Calculate standings for each group separately
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
        
        // Store groups in format if they weren't there
        if (!config.groups && groups.length > 0) {
          config.groups = groups
        }
        
        console.log('✅ calculateTable - Returning groupTables:', {
          groupsCount: groups.length,
          groupTablesKeys: Object.keys(groupTables),
          groupTables
        })
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
      
      // If we have groupsWithDivisionsConfig but didn't enter the branch above, still try to create groups
      // Also check if team count suggests groups format (16 teams = likely 4 groups of 4)
      const shouldBeGroups = tournament.format?.groupsWithDivisionsConfig || 
                            (teamCount === 16 && !tournament.format?.mode) ||
                            (teamCount === 16 && tournament.format?.mode === 'league')
      
      if (shouldBeGroups) {
        // Get or create config
        let config = tournament.format?.groupsWithDivisionsConfig
        if (!config) {
          // Infer from team count: 16 teams = 4 groups of 4
          const numberOfGroups = teamCount === 16 ? 4 : Math.ceil(teamCount / 4)
          const teamsPerGroup = Math.ceil(teamCount / numberOfGroups)
          config = {
            numberOfGroups,
            teamsPerGroup,
            groupRounds: 1
          }
          
          // Ensure format object exists
          if (!tournament.format) {
            tournament.format = { mode: 'groups_with_divisions', rounds: 1 }
          }
          tournament.format.mode = 'groups_with_divisions'
          tournament.format.groupsWithDivisionsConfig = config
        }
        
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // Create groups from teamIds
        const groups: string[][] = []
        for (let i = 0; i < numberOfGroups; i++) {
          const startIdx = i * teamsPerGroup
          const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
          groups.push(tournament.teamIds.slice(startIdx, endIdx))
        }
        
        // Calculate group tables
        const groupTables: Record<number, any[]> = {}
        groups.forEach((groupTeams: string[], groupIndex: number) => {
          const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
          
          groupTeams.forEach((tid: string) => {
            stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
          })
          
          // Count group matches
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
        
        console.log('✅ calculateTable - Fallback groupTables:', {
          groupsCount: groups.length,
          groupTablesKeys: Object.keys(groupTables)
        })
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
      
      const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
      const eliminatedTeams = new Set<string>()
      
      for (const tid of tournament.teamIds) {
        if (tid) {
          stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        }
      }
      
      // Count league matches for the table
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
      
      // Also count playoff matches for points (3 win, 1 draw, 0 loss)
      // Get playoff matches from tournament.matches and custom playoff rounds
      const playoffMatchesList: any[] = []
      
      // Get regular playoff matches
      if (tournament.matches && Array.isArray(tournament.matches)) {
        playoffMatchesList.push(...tournament.matches.filter((m: any) => m && m.isPlayoff))
      }
      
      // For custom playoff format, also include matches from custom playoff configuration
      if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
        tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((match: any) => {
              // Check both match-level and round-level elimination flags
              const isEliminationMatch = match.isElimination || round.isElimination || false
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
        if (!m || (m as any).homeGoals == null || (m as any).awayGoals == null) continue
        
        const homeTeamId = (m as any).homeTeamId
        const awayTeamId = (m as any).awayTeamId
        
        if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) continue // Skip BYE matches
        
        const a = stats[homeTeamId]
        const b = stats[awayTeamId]
        
        if (!a || !b) continue
        
        // Count all playoff matches for points (3 win, 1 draw, 0 loss)
        a.p++; b.p++
        a.gf += (m as any).homeGoals; a.ga += (m as any).awayGoals
        b.gf += (m as any).awayGoals; b.ga += (m as any).homeGoals
        
        if ((m as any).homeGoals > (m as any).awayGoals) { 
          a.w++; b.l++; a.pts += 3
          // Check if this is an elimination match and mark loser as eliminated
          if ((m as any).isElimination) {
            eliminatedTeams.add(awayTeamId)
          }
        } else if ((m as any).homeGoals < (m as any).awayGoals) { 
          b.w++; a.l++; b.pts += 3
          // Check if this is an elimination match and mark loser as eliminated
          if ((m as any).isElimination) {
            eliminatedTeams.add(homeTeamId)
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
        .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
      
      return { table, eliminatedTeams, groupTables: {} }
    } catch (error) {
      console.error('Error calculating table:', error)
      return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    }
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

      {/* Championship Table or Group Tables */}
      {(() => {
        const hasGroupMatches = tournament.matches?.some((m: any) => m.groupIndex && !m.isPlayoff) || false
        const isGroupsFormatByMode = tournament.format?.mode === 'groups_with_divisions'
        const isGroupsFormatByMatches = hasGroupMatches
        const hasGroupTables = Object.keys(groupTables).length > 0
        const hasGroupsConfig = !!tournament.format?.groupsWithDivisionsConfig
        const teamCount = tournament.teamIds?.length || 0
        // If we have groupTables, definitely show groups. Also check config or team count
        const isGroupsFormatByTables = hasGroupTables || hasGroupsConfig || (teamCount === 16 && !tournament.format?.mode)
        
        const isGroupsFormat = isGroupsFormatByMode || isGroupsFormatByMatches || isGroupsFormatByTables
        
        console.log('🎯 PublicTournamentPage - Display condition check:', {
          isGroupsFormatByMode,
          isGroupsFormatByMatches,
          hasGroupTables,
          hasGroupsConfig,
          isGroupsFormatByTables,
          isGroupsFormat,
          teamCount,
          groupTablesKeys: Object.keys(groupTables),
          formatMode: tournament.format?.mode
        })
        
        return isGroupsFormat
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
              // Get groups from format or reconstruct from groupTables or teamIds
              let groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
              const config = tournament.format.groupsWithDivisionsConfig
              const numberOfGroups = config.numberOfGroups || 4
              const teamsPerGroup = config.teamsPerGroup || 4
              
              // If no groups and no groupTables, create groups from teamIds
              if (groups.length === 0 && Object.keys(groupTables).length === 0) {
                groups = []
                for (let i = 0; i < numberOfGroups; i++) {
                  const startIdx = i * teamsPerGroup
                  const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
                  groups.push(tournament.teamIds.slice(startIdx, endIdx))
                }
              }
              
              // Use groupTables if available, otherwise create empty tables
              return groups.map((groupTeams: string[], groupIndex: number) => {
                const groupTable = (groupTables as Record<number, any[]>)[groupIndex + 1] || 
                  groupTeams.map((teamId: string) => ({
                    id: teamId,
                    p: 0,
                    w: 0,
                    d: 0,
                    l: 0,
                    gf: 0,
                    ga: 0,
                    pts: 0
                  }))
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
      )}

      {/* Playoff Bracket Section */}
              {(() => {
                const modeCheck = tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination' || tournament.format?.mode === 'league_custom_playoff'
                const playoffMatchesCheck = playoffMatches.length > 0
                const customPlayoffCheck = tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds?.length > 0
                const shouldShowPlayoff = modeCheck && (playoffMatchesCheck || customPlayoffCheck)
                
                console.log('🎯 PublicTournamentPage: Playoff bracket visibility check:', {
                  mode: tournament.format?.mode,
                  modeCheck,
                  playoffMatchesLength: playoffMatches.length,
                  playoffMatchesCheck,
                  customPlayoffRoundsLength: tournament.format?.customPlayoffConfig?.playoffRounds?.length,
                  customPlayoffCheck,
                  shouldShowPlayoff,
                  playoffMatches: playoffMatches
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
                        
                        // Debug: Log match scores for this specific match
                        console.log(`PublicTournamentPage: Displaying match ${match.id}:`, {
                          homeGoals: match.homeGoals,
                          awayGoals: match.awayGoals,
                          homeGoalsType: typeof match.homeGoals,
                          awayGoalsType: typeof match.awayGoals,
                          hasHomeGoals: match.homeGoals !== undefined && match.homeGoals !== null,
                          hasAwayGoals: match.awayGoals !== undefined && match.awayGoals !== null,
                          fullMatch: match
                        })
                        
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
                              {(() => {
                                // More robust check: allow 0 as a valid score
                                const hasHomeGoals = match.homeGoals !== undefined && match.homeGoals !== null && match.homeGoals !== ''
                                const hasAwayGoals = match.awayGoals !== undefined && match.awayGoals !== null && match.awayGoals !== ''
                                
                                if (hasHomeGoals && hasAwayGoals) {
                                  return (
                                    <Link 
                                      to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                                      className="text-lg font-semibold hover:opacity-80 transition-opacity"
                                    >
                                      {match.homeGoals} : {match.awayGoals}
                                    </Link>
                                  )
                                } else {
                                  return (
                                    <Link 
                                      to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
                                      className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                                    >
                                      TBD
                                    </Link>
                                  )
                                }
                              })()}
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
                    {((m.homeGoals !== undefined && m.homeGoals !== null) && 
                      (m.awayGoals !== undefined && m.awayGoals !== null)) ? (
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
                  {((m.homeGoals !== undefined && m.homeGoals !== null) && 
                    (m.awayGoals !== undefined && m.awayGoals !== null)) ? (
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

