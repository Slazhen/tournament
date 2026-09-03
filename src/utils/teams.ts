import type { Team } from '../types'

/**
 * Team names as they should be compared, not as they are displayed.
 * "FC Volna", "fc volna" and "F.C. Volna" are the same club.
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ')
    .trim()
}

export type NameCheck = {
  /** The same name is already taken — adding it again would be a mistake. */
  duplicate?: Team
  /** A different but suspiciously close name, e.g. "Sporting FC" next to "Sporting Sydney FC". */
  similar: Team[]
}

/**
 * Looks for a team that already exists under this name.
 *
 * Nothing checked this before, which is how a list ends up with two clubs whose
 * fixtures and results are split between them.
 */
export function checkTeamName(name: string, teams: Team[]): NameCheck {
  const needle = normalizeTeamName(name)
  if (!needle) return { similar: [] }

  const duplicate = teams.find((team) => normalizeTeamName(team.name) === needle)
  if (duplicate) return { duplicate, similar: [] }

  // One name containing the other is the common near-miss.
  const similar = teams.filter((team) => {
    const other = normalizeTeamName(team.name)
    return other.includes(needle) || needle.includes(other)
  })

  return { similar }
}

export type BulkNames = {
  toCreate: string[]
  duplicates: string[]
  /** Names repeated inside the pasted list itself. */
  repeated: string[]
}

/** Splits a pasted block of names and separates out the ones already on file. */
export function parseBulkNames(input: string, teams: Team[]): BulkNames {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const existing = new Set(teams.map((team) => normalizeTeamName(team.name)))
  const seen = new Set<string>()

  const toCreate: string[] = []
  const duplicates: string[] = []
  const repeated: string[] = []

  for (const line of lines) {
    const key = normalizeTeamName(line)
    if (!key) continue
    if (existing.has(key)) {
      duplicates.push(line)
    } else if (seen.has(key)) {
      repeated.push(line)
    } else {
      seen.add(key)
      toCreate.push(line)
    }
  }

  return { toCreate, duplicates, repeated }
}

/**
 * The public address of a club, carrying the competition it was reached from.
 *
 * The club page shows one squad tab per competition and a tab for the whole
 * club, and which of them opens is decided by the link rather than by the page:
 * somebody clicking a name in a league table is asking about that league's
 * squad, not about everybody the club has ever signed. A link without the
 * parameter still opens the full squad, so nothing that shares one has to know
 * about this.
 */
export function publicTeamUrl(teamId: string, fromTournamentId?: string): string {
  const base = `/public/teams/${teamId}`
  return fromTournamentId ? `${base}?tab=${fromTournamentId}` : base
}

/**
 * Whether the person reading may edit this club's own record — its name, its
 * crest, its colours and its squad.
 *
 * The same rule the API applies in `assertManagesTeam`, so that a control is
 * offered only where the write behind it will be accepted: a club nobody has
 * taken on belongs to the organizer who created it, and one that has a manager
 * belongs to them. It says nothing about the competition — entering the club,
 * naming its teamsheet and removing it from a season are the organizer's
 * whoever runs the club.
 *
 * A public copy of the record carries no `managerUserIds` at all and so reads
 * as unclaimed here; the public pages offer no editing either way.
 */
export function canEditClub(
  team: Pick<Team, 'managerUserIds' | 'visiting'>,
  userId: string | undefined,
  superAdmin: boolean,
): boolean {
  if (superAdmin) return true
  // Another organiser's club, here because it plays in one of ours. The API
  // strips its manager list, so the "nobody runs it, therefore it is mine to
  // edit" rule below would otherwise read as yes on every one of them.
  if (team.visiting === true) return false
  const managers = team.managerUserIds ?? []
  if (userId && managers.includes(userId)) return true
  return managers.length === 0
}
