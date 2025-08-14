import type { Match } from '../types'

export function generateRoundRobinSchedule(teamIds: string[]): Match[] {
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
      matches.push({
        id: `${round}-${home}-${away}`,
        homeTeamId: round % 2 === 0 ? home : away,
        awayTeamId: round % 2 === 0 ? away : home,
        round,
      })
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

