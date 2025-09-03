import type { Match, PlayoffBracket } from '../types'

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

    // Create final round if we have more than 1 team after first round
    const winners = firstRoundMatches.map(m => m.winner || m.homeTeamId).filter(id => id)
    if (winners.length > 1) {
      round++
      const finalMatches = []
      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          finalMatches.push({
            matchId: `playoff-${round}-${i/2}`,
            homeTeamId: `winner-${i + 1}`,
            awayTeamId: `winner-${i + 2}`,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined,
            winner: undefined
          })
        } else {
          // Odd number of teams - bye to next round
          finalMatches.push({
            matchId: `playoff-${round}-${i/2}`,
            homeTeamId: `winner-${i + 1}`,
            awayTeamId: `winner-${i + 1}`,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined,
            winner: `winner-${i + 1}`
          })
        }
      }
      
      if (finalMatches.length > 0) {
        brackets.push({
          round,
          matches: finalMatches
        })
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

