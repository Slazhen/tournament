import type { Match, PlayoffBracket, CustomPlayoffRound, TeamStanding } from '../types'

export function generateRoundRobinSchedule(teamIds: string[], roundsMultiplier: number = 1): Match[] {
  if (teamIds.length < 2) return []
  const teams = [...teamIds]
  const isOdd = teams.length % 2 === 1
  if (isOdd) teams.push('BYE')
  const numTeams = teams.length
  const rounds = numTeams - 1
  const matches: Match[] = []
  const left = teams.slice(0, numTeams / 2)
  const right = teams.slice(numTeams / 2).reverse()

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < left.length; i++) {
      const home = left[i]
      const away = right[i]
      if (home === 'BYE' || away === 'BYE') continue
      for (let leg = 0; leg < Math.max(1, Math.min(4, roundsMultiplier)); leg++) {
        const globalRound = round + leg * rounds
        matches.push({
          id: `${globalRound}-${home}-${away}-${leg}`,
          homeTeamId: (globalRound % 2 === 0) ? home : away,
          awayTeamId: (globalRound % 2 === 0) ? away : home,
          round: globalRound,
        })
      }
    }
    // rotate arrays
    const fixed = left[0]
    const moveFromLeft = left.pop()!
    const moveFromRight = right.shift()!
    left[0] = fixed
    left.splice(1, 0, moveFromRight)
    right.push(moveFromLeft)
  }
  return matches
}

export function generatePlayoffBrackets(qualifiedTeamIds: string[]): PlayoffBracket[] {
  if (qualifiedTeamIds.length < 2) return []

  const brackets: PlayoffBracket[] = []
  let round = 0

  // For 4 teams: First round is Semi Finals, Second round is Final
  if (qualifiedTeamIds.length === 4) {
    // Semi Finals
    const semiFinalMatches = [
      {
        matchId: `playoff-${round}-0`,
        homeTeamId: `seed-1`, // 1st place
        awayTeamId: `seed-4`, // 4th place
        homeGoals: undefined,
        awayGoals: undefined,
        dateISO: undefined,
        winner: undefined
      },
      {
        matchId: `playoff-${round}-1`,
        homeTeamId: `seed-2`, // 2nd place
        awayTeamId: `seed-3`, // 3rd place
        homeGoals: undefined,
        awayGoals: undefined,
        dateISO: undefined,
        winner: undefined
      }
    ]

    brackets.push({
      round,
      matches: semiFinalMatches
    })

    // Final
    round++
    const finalMatches = [
      {
        matchId: `playoff-${round}-0`,
        homeTeamId: `winner-1`, // Winner of first semi-final
        awayTeamId: `winner-2`, // Winner of second semi-final
        homeGoals: undefined,
        awayGoals: undefined,
        dateISO: undefined,
        winner: undefined
      }
    ]

    brackets.push({
      round,
      matches: finalMatches
    })
  } else {
    // For other team counts, use the general logic
    const firstRoundMatches = []
    for (let i = 0; i < qualifiedTeamIds.length; i += 2) {
      if (i + 1 < qualifiedTeamIds.length) {
        firstRoundMatches.push({
          matchId: `playoff-${round}-${i/2}`,
          homeTeamId: `seed-${i + 1}`,
          awayTeamId: `seed-${qualifiedTeamIds.length - i}`,
          homeGoals: undefined,
          awayGoals: undefined,
          dateISO: undefined,
          winner: undefined
        })
      } else {
        // Odd number of teams - bye to next round
        firstRoundMatches.push({
          matchId: `playoff-${round}-${i/2}`,
          homeTeamId: `seed-${i + 1}`,
          awayTeamId: `seed-${i + 1}`,
          homeGoals: undefined,
          awayGoals: undefined,
          dateISO: undefined,
          winner: `seed-${i + 1}`
        })
      }
    }
    
    brackets.push({
      round,
      matches: firstRoundMatches
    })

    // Create subsequent rounds recursively until we have a final
    let currentWinners = firstRoundMatches.map(m => m.winner || m.homeTeamId).filter(id => id && id !== 'BYE')
    let currentRound = round
    
    while (currentWinners.length > 1) {
      currentRound++
      const nextRoundMatches = []
      for (let i = 0; i < currentWinners.length; i += 2) {
        if (i + 1 < currentWinners.length) {
          nextRoundMatches.push({
            matchId: `playoff-${currentRound}-${i/2}`,
            homeTeamId: `winner-${i + 1}`,
            awayTeamId: `winner-${i + 2}`,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined,
            winner: undefined
          })
        } else {
          // Odd number of teams - bye to next round
          nextRoundMatches.push({
            matchId: `playoff-${currentRound}-${i/2}`,
            homeTeamId: `winner-${i + 1}`,
            awayTeamId: `winner-${i + 1}`,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined,
            winner: `winner-${i + 1}`
          })
        }
      }
      
      if (nextRoundMatches.length > 0) {
        brackets.push({
          round: currentRound,
          matches: nextRoundMatches
        })
        // Update winners for next iteration
        currentWinners = nextRoundMatches.map(m => m.winner || m.homeTeamId).filter(id => id && id !== 'BYE')
      } else {
        break
      }
    }
  }
  return brackets;
}

export function createPlayoffMatches(brackets: PlayoffBracket[]): Match[] {
  const matches: Match[] = []
  
  brackets.forEach(bracket => {
    bracket.matches.forEach(match => {
      if (match.homeTeamId !== match.awayTeamId) { // Skip bye matches
        matches.push({
          id: match.matchId,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          dateISO: match.dateISO,
          isPlayoff: true,
          playoffRound: bracket.round,
          playoffMatch: parseInt(match.matchId.split('-')[2])
        })
      }
    })
  })
  
  return matches
}

export function generateSwissEliminationSchedule(teamIds: string[], leagueRounds: number = 2): { leagueMatches: Match[], eliminationMatches: Match[] } {
  if (teamIds.length < 4) return { leagueMatches: [], eliminationMatches: [] }
  
  // Generate initial league matches (1-2 rounds)
  const leagueMatches = generateRoundRobinSchedule(teamIds, leagueRounds)
  
  // Generate elimination matches based on standings
  const eliminationMatches: Match[] = []
  let currentRound = leagueRounds
  
  // Start with all teams
  let remainingTeams = [...teamIds]
  
  // Continue elimination rounds until we have 4 teams for semifinals
  while (remainingTeams.length > 4) {
    const roundMatches: Match[] = []
    
    // Create elimination pairs (1v2, 3v4, 5v6, 7v8, etc.)
    for (let i = 0; i < remainingTeams.length; i += 2) {
      if (i + 1 < remainingTeams.length) {
        roundMatches.push({
          id: `elimination-${currentRound}-${i/2}`,
          homeTeamId: remainingTeams[i],
          awayTeamId: remainingTeams[i + 1],
          round: currentRound,
          isPlayoff: true,
          playoffRound: currentRound,
          playoffMatch: i / 2
        })
      } else {
        // Odd team gets a bye to next round
        roundMatches.push({
          id: `elimination-${currentRound}-${i/2}`,
          homeTeamId: remainingTeams[i],
          awayTeamId: remainingTeams[i],
          round: currentRound,
          isPlayoff: true,
          playoffRound: currentRound,
          playoffMatch: i / 2
        })
      }
    }
    
    eliminationMatches.push(...roundMatches)
    
    // Update remaining teams for next round
    // Winners advance, losers are eliminated
    // For now, we'll use placeholder logic - in practice, this would be determined by match results
    const nextRoundTeams: string[] = []
    for (let i = 0; i < remainingTeams.length; i += 2) {
      if (i + 1 < remainingTeams.length) {
        // In a real implementation, this would be determined by match results
        // For now, we'll advance the first team of each pair
        nextRoundTeams.push(remainingTeams[i])
      } else {
        // Odd team gets a bye
        nextRoundTeams.push(remainingTeams[i])
      }
    }
    
    remainingTeams = nextRoundTeams
    currentRound++
  }
  
  // Generate semifinal and final matches for the final 4 teams
  if (remainingTeams.length === 4) {
    // Semifinals
    eliminationMatches.push(
      {
        id: `semifinal-1`,
        homeTeamId: remainingTeams[0],
        awayTeamId: remainingTeams[3],
        round: currentRound,
        isPlayoff: true,
        playoffRound: currentRound,
        playoffMatch: 0
      },
      {
        id: `semifinal-2`,
        homeTeamId: remainingTeams[1],
        awayTeamId: remainingTeams[2],
        round: currentRound,
        isPlayoff: true,
        playoffRound: currentRound,
        playoffMatch: 1
      }
    )
    
    currentRound++
    
    // Final
    eliminationMatches.push({
      id: `final`,
      homeTeamId: 'winner-semifinal-1',
      awayTeamId: 'winner-semifinal-2',
      round: currentRound,
      isPlayoff: true,
      playoffRound: currentRound,
      playoffMatch: 0
    })
  }
  
  return { leagueMatches, eliminationMatches }
}

export function generateGroupsWithDivisionsSchedule(
  teamIds: string[],
  config: {
    numberOfGroups: number
    teamsPerGroup: number
    groupRounds: number // 1 or 2
    existingGroups?: string[][] // Optional: use existing groups if provided
  }
): { matches: Match[], groups: string[][] } {
  const { numberOfGroups, teamsPerGroup, groupRounds, existingGroups } = config
  const totalTeamsNeeded = numberOfGroups * teamsPerGroup
  
  if (teamIds.length < totalTeamsNeeded) {
    console.warn(`Not enough teams: need ${totalTeamsNeeded}, got ${teamIds.length}`)
  }
  
  // Divide teams into groups - use existing groups if provided, otherwise create new ones
  const groups: string[][] = existingGroups || []
  
  if (groups.length === 0) {
    // Randomize team distribution for new groups
    const shuffledTeams = [...teamIds].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < numberOfGroups; i++) {
      const startIdx = i * teamsPerGroup
      const endIdx = Math.min(startIdx + teamsPerGroup, shuffledTeams.length)
      groups.push(shuffledTeams.slice(startIdx, endIdx))
    }
  }
  
  // Generate group stage matches (round-robin within each group)
  // All groups share the same round numbers (0, 1, 2) so they can be reorganized later
  const groupMatches: Match[] = []
  
  groups.forEach((groupTeams, groupIndex) => {
    if (groupTeams.length < 2) return
    
    // Generate round-robin matches for this group
    const groupMatchesForRound = generateRoundRobinSchedule(groupTeams, groupRounds)
    
    // Keep the same round numbers for all groups (don't offset)
    // This allows us to reorganize rounds later (Round 1 = first games from all groups)
    const adjustedMatches = groupMatchesForRound.map(match => ({
      ...match,
      id: `group-${groupIndex + 1}-${match.id}`,
      round: match.round || 0, // Keep original round number (0, 1, 2)
      isPlayoff: false,
      groupIndex: groupIndex + 1 // Store group number for reference
    }))
    
    groupMatches.push(...adjustedMatches)
  })
  
  // Calculate max group round to offset playoff rounds
  const maxGroupRound = groupMatches.length > 0 
    ? Math.max(...groupMatches.map(m => m.round || 0), 0)
    : -1
  const playoffRoundOffset = maxGroupRound + 1
  
  // Generate playoff teams based on group positions
  // Division 1: 1st and 2nd from each group
  // Division 2: 3rd and 4th from each group
  const division1Teams: string[] = []
  const division2Teams: string[] = []
  
  // For now, we'll create placeholder teams. In practice, these will be determined by group standings
  // The structure will be: group1-1st, group1-2nd, group2-1st, group2-2nd, etc.
  groups.forEach((groupTeams, groupIndex) => {
    // Division 1 qualifiers (1st and 2nd place)
    division1Teams.push(`group-${groupIndex + 1}-1st`, `group-${groupIndex + 1}-2nd`)
    
    // Division 2 qualifiers (3rd and 4th place) - only if group has 4+ teams
    if (groupTeams.length >= 4) {
      division2Teams.push(`group-${groupIndex + 1}-3rd`, `group-${groupIndex + 1}-4th`)
    } else if (groupTeams.length === 3) {
      division2Teams.push(`group-${groupIndex + 1}-3rd`)
    }
  })
  
  // Generate Division 1 playoff matches (Quarter Finals -> Semi Finals -> Final)
  const division1Matches: Match[] = []
  const division1Brackets = generatePlayoffBrackets(division1Teams)
  const division1PlayoffMatches = createPlayoffMatches(division1Brackets)
  
  // Use playoffRound for organization, but set round to come after group matches
  division1PlayoffMatches.forEach((match) => {
    division1Matches.push({
      ...match,
      id: `div1-${match.id}`,
      round: playoffRoundOffset + (match.playoffRound || 0), // Offset to come after group matches
      isPlayoff: true,
      playoffRound: match.playoffRound, // Keep original playoffRound (0, 1, 2) for display
      division: 1 // Mark as Division 1
    })
  })
  
  // Generate Division 2 playoff matches (if there are enough teams)
  const division2Matches: Match[] = []
  if (division2Teams.length >= 4) {
    const division2Brackets = generatePlayoffBrackets(division2Teams)
    const division2PlayoffMatches = createPlayoffMatches(division2Brackets)
    
    // Use playoffRound for organization, but set round to come after group matches
    division2PlayoffMatches.forEach((match) => {
      division2Matches.push({
        ...match,
        id: `div2-${match.id}`,
        round: playoffRoundOffset + (match.playoffRound || 0), // Offset to come after group matches
        isPlayoff: true,
        playoffRound: match.playoffRound, // Keep original playoffRound (0, 1, 2) for display
        division: 2 // Mark as Division 2
      })
    })
  }
  
  // Combine all matches and return with groups
  return {
    matches: [...groupMatches, ...division1Matches, ...division2Matches],
    groups: groups
  }
}

export function populatePlayoffBrackets(brackets: PlayoffBracket[], finalStandings: string[]): PlayoffBracket[] {
  if (!brackets.length || !finalStandings.length) return brackets
  
  const populatedBrackets = brackets.map(bracket => ({
    ...bracket,
    matches: bracket.matches.map(match => {
      const populatedMatch = { ...match }
      
      // Replace seed positions with actual teams
      if (match.homeTeamId.startsWith('seed-')) {
        const seedNumber = parseInt(match.homeTeamId.replace('seed-', ''))
        if (seedNumber <= finalStandings.length) {
          populatedMatch.homeTeamId = finalStandings[seedNumber - 1]
        }
      }
      
      if (match.awayTeamId.startsWith('seed-')) {
        const seedNumber = parseInt(match.awayTeamId.replace('seed-', ''))
        if (seedNumber <= finalStandings.length) {
          populatedMatch.awayTeamId = finalStandings[seedNumber - 1]
        }
      }
      
      // Replace winner positions with actual teams
      if (match.winner && match.winner.startsWith('seed-')) {
        const seedNumber = parseInt(match.winner.replace('seed-', ''))
        if (seedNumber <= finalStandings.length) {
          populatedMatch.winner = finalStandings[seedNumber - 1]
        }
      }
      
      // Handle winner positions for subsequent rounds
      if (match.homeTeamId.startsWith('winner-')) {
        // For now, we'll keep winner positions as placeholders
        // They will be populated when previous round matches are completed
        populatedMatch.homeTeamId = 'TBD' // To Be Determined
      }
      
      if (match.awayTeamId.startsWith('winner-')) {
        populatedMatch.awayTeamId = 'TBD' // To Be Determined
      }
      
      return populatedMatch
    })
  }))
  
  return populatedBrackets
}

// Custom Playoff Homebush Implementation
export function generateCustomPlayoffHomebush(
  teamStandings: TeamStanding[], 
  config: {
    topSeeds?: number
    playoffTeams?: number
    enableBye?: boolean
    reSeedRound5?: boolean
  } = {}
): CustomPlayoffRound[] {
  const {
    playoffTeams = 8,
    enableBye = true,
    reSeedRound5 = true
  } = config

  // Sort teams by position (1st to last)
  const sortedTeams = [...teamStandings].sort((a, b) => a.position - b.position)
  const playoffTeamsList = sortedTeams.slice(0, playoffTeams)
  
  const rounds: CustomPlayoffRound[] = []
  let currentRound = 1

  // Round 1: Qualifiers and Elimination matches
  const round1Matches: Match[] = []
  
  // Qualifier A: Seed(1) vs Seed(2) - not elimination
  round1Matches.push({
    id: `r1-qual-a-${playoffTeamsList[0].teamId}-${playoffTeamsList[1].teamId}`,
    homeTeamId: playoffTeamsList[0].teamId, // Higher seed at home
    awayTeamId: playoffTeamsList[1].teamId,
    round: currentRound,
    isPlayoff: true,
    playoffRound: 0 // Round 1
  })

  // Qualifier B: Seed(3) vs Seed(4) - not elimination  
  round1Matches.push({
    id: `r1-qual-b-${playoffTeamsList[2].teamId}-${playoffTeamsList[3].teamId}`,
    homeTeamId: playoffTeamsList[2].teamId, // Higher seed at home
    awayTeamId: playoffTeamsList[3].teamId,
    round: currentRound,
    isPlayoff: true,
    playoffRound: 0 // Round 1
  })

  // Elimination matches for lower seeds
  if (playoffTeamsList.length >= 8) {
    // Elim A: Seed(5) vs Seed(8) - elimination
    round1Matches.push({
      id: `r1-elim-a-${playoffTeamsList[4].teamId}-${playoffTeamsList[7].teamId}`,
      homeTeamId: playoffTeamsList[4].teamId,
      awayTeamId: playoffTeamsList[7].teamId,
      round: currentRound,
      isPlayoff: true,
      playoffRound: 0 // Round 1
    })

    // Elim B: Seed(6) vs Seed(7) - elimination
    round1Matches.push({
      id: `r1-elim-b-${playoffTeamsList[5].teamId}-${playoffTeamsList[6].teamId}`,
      homeTeamId: playoffTeamsList[5].teamId,
      awayTeamId: playoffTeamsList[6].teamId,
      round: currentRound,
      isPlayoff: true,
      playoffRound: 0 // Round 1
    })
  } else if (playoffTeamsList.length === 9 && enableBye) {
    // Handle 9 teams with BYE for Seed(9)
    round1Matches.push({
      id: `r1-elim-a-${playoffTeamsList[4].teamId}-${playoffTeamsList[7].teamId}`,
      homeTeamId: playoffTeamsList[4].teamId,
      awayTeamId: playoffTeamsList[7].teamId,
      round: currentRound,
      isPlayoff: true,
      playoffRound: 0 // Round 1
    })

    round1Matches.push({
      id: `r1-elim-b-${playoffTeamsList[5].teamId}-${playoffTeamsList[6].teamId}`,
      homeTeamId: playoffTeamsList[5].teamId,
      awayTeamId: playoffTeamsList[6].teamId,
      round: currentRound,
      isPlayoff: true,
      playoffRound: 0 // Round 1
    })
  }

  rounds.push({
    id: 'round-1',
    name: 'Round 1 - Qualifiers & Elimination',
    round: currentRound,
    matches: round1Matches,
    isElimination: false, // Mixed round
    description: 'Qualifiers A & B (non-elimination), Elimination A & B (elimination)'
  })

  currentRound++

  // Round 2: Elim C - Elimination
  const round2Matches: Match[] = []
  round2Matches.push({
    id: `r2-elim-c-winner-elim-a-vs-winner-elim-b`,
    homeTeamId: 'TBD', // Will be populated with actual winners
    awayTeamId: 'TBD',
    round: currentRound,
    isPlayoff: true,
    playoffRound: 1 // Round 2
  })

  rounds.push({
    id: 'round-2',
    name: 'Round 2 - Elimination C',
    round: currentRound,
    matches: round2Matches,
    isElimination: true,
    description: 'Winner of Elim A vs Winner of Elim B (elimination)'
  })

  currentRound++

  // Round 3: Semi (Upper) - not elimination
  const round3Matches: Match[] = []
  round3Matches.push({
    id: `r3-semi-upper-loser-qual-a-vs-winner-qual-b`,
    homeTeamId: 'TBD', // Loser of Qualifier A
    awayTeamId: 'TBD', // Winner of Qualifier B
    round: currentRound,
    isPlayoff: true,
    playoffRound: 2 // Round 3
  })

  rounds.push({
    id: 'round-3',
    name: 'Round 3 - Semi (Upper)',
    round: currentRound,
    matches: round3Matches,
    isElimination: false,
    description: 'Loser of Qualifier A vs Winner of Qualifier B (non-elimination)'
  })

  currentRound++

  // Round 4: Knockout - Elimination
  const round4Matches: Match[] = []
  round4Matches.push({
    id: `r4-knockout-loser-r3-vs-ladder-survivor`,
    homeTeamId: 'TBD', // Loser of R3
    awayTeamId: 'TBD', // Ladder Survivor (Winner of R2)
    round: currentRound,
    isPlayoff: true,
    playoffRound: 3 // Round 4
  })

  rounds.push({
    id: 'round-4',
    name: 'Round 4 - Knockout',
    round: currentRound,
    matches: round4Matches,
    isElimination: true,
    description: 'Loser of R3 vs Ladder Survivor (elimination)'
  })

  currentRound++

  // Round 5: Preliminary Finals - both elimination
  const round5Matches: Match[] = []
  
  if (reSeedRound5) {
    // Re-seed remaining teams by original position
    round5Matches.push({
      id: `r5-pf-a-highest-vs-lowest`,
      homeTeamId: 'TBD', // Highest remaining seed
      awayTeamId: 'TBD', // Lowest remaining seed
      round: currentRound,
      isPlayoff: true,
      playoffRound: 4 // Round 5
    })

    round5Matches.push({
      id: `r5-pf-b-middle-seeds`,
      homeTeamId: 'TBD', // Second highest remaining seed
      awayTeamId: 'TBD', // Second lowest remaining seed
      round: currentRound,
      isPlayoff: true,
      playoffRound: 4 // Round 5
    })
  } else {
    // Use bracket progression
    round5Matches.push({
      id: `r5-pf-a-winner-qual-a-vs-winner-r3`,
      homeTeamId: 'TBD', // Winner of Qualifier A
      awayTeamId: 'TBD', // Winner of R3
      round: currentRound,
      isPlayoff: true,
      playoffRound: 4 // Round 5
    })

    round5Matches.push({
      id: `r5-pf-b-winner-r4-vs-tbd`,
      homeTeamId: 'TBD', // Winner of R4
      awayTeamId: 'TBD', // TBD based on bracket
      round: currentRound,
      isPlayoff: true,
      playoffRound: 4 // Round 5
    })
  }

  rounds.push({
    id: 'round-5',
    name: 'Round 5 - Preliminary Finals',
    round: currentRound,
    matches: round5Matches,
    isElimination: true,
    description: 'Two Preliminary Finals (both elimination)'
  })

  currentRound++

  // Round 6: Grand Final - elimination
  const round6Matches: Match[] = []
  round6Matches.push({
    id: `r6-grand-final-winner-pf-a-vs-winner-pf-b`,
    homeTeamId: 'TBD', // Winner of PF-A
    awayTeamId: 'TBD', // Winner of PF-B
    round: currentRound,
    isPlayoff: true,
    playoffRound: 5 // Round 6
  })

  rounds.push({
    id: 'round-6',
    name: 'Round 6 - Grand Final',
    round: currentRound,
    matches: round6Matches,
    isElimination: true,
    description: 'Grand Final - Winner of PF-A vs Winner of PF-B (elimination)'
  })

  return rounds
}

// Tie-breaker system
export function calculateTeamStandings(
  matches: Match[], 
  teamId: string
): TeamStanding {
  const teamMatches = matches.filter(m => 
    m.homeTeamId === teamId || m.awayTeamId === teamId
  ).filter(m => m.homeGoals !== null && m.awayGoals !== null)

  let points = 0
  let played = teamMatches.length
  let won = 0
  let drawn = 0
  let lost = 0
  let goalsFor = 0
  let goalsAgainst = 0
  let disciplinaryPoints = 0

  teamMatches.forEach(match => {
    const isHome = match.homeTeamId === teamId
    const teamGoals = isHome ? match.homeGoals! : match.awayGoals!
    const opponentGoals = isHome ? match.awayGoals! : match.homeGoals!

    goalsFor += teamGoals
    goalsAgainst += opponentGoals

    if (teamGoals > opponentGoals) {
      won++
      points += 3
    } else if (teamGoals === opponentGoals) {
      drawn++
      points += 1
    } else {
      lost++
    }

    // TODO: Add disciplinary points calculation when cards are implemented
  })

  return {
    teamId,
    position: 0, // Will be calculated after all teams
    points,
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    disciplinaryPoints
  }
}

// Sort teams by tie-breaker criteria
export function sortTeamsByStandings(standings: TeamStanding[]): TeamStanding[] {
  return standings.sort((a, b) => {
    // 1. Points (descending)
    if (a.points !== b.points) return b.points - a.points
    
    // 2. Goal difference (descending)
    if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference
    
    // 3. Goals scored (descending)
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor
    
    // 4. Head-to-head points (if available)
    if (a.headToHeadPoints !== undefined && b.headToHeadPoints !== undefined) {
      if (a.headToHeadPoints !== b.headToHeadPoints) return b.headToHeadPoints - a.headToHeadPoints
    }
    
    // 5. Head-to-head goal difference (if available)
    if (a.headToHeadGoalDifference !== undefined && b.headToHeadGoalDifference !== undefined) {
      if (a.headToHeadGoalDifference !== b.headToHeadGoalDifference) return b.headToHeadGoalDifference - a.headToHeadGoalDifference
    }
    
    // 6. Fewer disciplinary points (ascending)
    if (a.disciplinaryPoints !== b.disciplinaryPoints) return a.disciplinaryPoints - b.disciplinaryPoints
    
    // 7. Coin toss (random)
    return Math.random() - 0.5
  }).map((standing, index) => ({
    ...standing,
    position: index + 1
  }))
}

