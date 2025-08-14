export type Team = {
  id: string
  name: string
  colorHex?: string
}

export type Match = {
  id: string
  homeTeamId: string
  awayTeamId: string
  dateISO?: string
  homeGoals?: number
  awayGoals?: number
  round?: number
}

export type Tournament = {
  id: string
  name: string
  createdAtISO: string
  teamIds: string[]
  matches: Match[]
}

