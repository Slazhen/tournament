import type { Tournament, Match } from '../types'
import type { TournamentSummary } from '../lib/data'
import { getAdminTournamentUrl, slugify, type SluggableTournament } from './urls'
import { calculateTeamStandings, sortTeamsByStandings } from './schedule'

/**
 * Seasons.
 *
 * A league run again next year is the next season of the same competition, not
 * a new one — but the app had no way to say so, so a second season arrived as
 * an unrelated tournament with the year typed into its name. Seasons of one
 * competition share a `seriesId`; everything else here is derived from that.
 */

export type SeasonStatus = 'upcoming' | 'running' | 'finished'

type SeasonLike = {
  id: string
  name: string
  createdAtISO?: string
  seriesId?: string
  seriesName?: string
  seasonLabel?: string
}

/** The key seasons of one competition share. A lone tournament is its own series. */
export const seriesKey = (tournament: SeasonLike): string => tournament.seriesId || tournament.id

/** The competition's name. */
export const seriesName = (tournament: SeasonLike): string =>
  tournament.seriesName?.trim() || tournament.name

/** What this season is called — the year it was created, unless it was named. */
export const seasonLabel = (tournament: SeasonLike): string => {
  const label = tournament.seasonLabel?.trim()
  if (label) return label
  return tournament.createdAtISO
    ? String(new Date(tournament.createdAtISO).getFullYear())
    : String(new Date().getFullYear())
}

export const seriesSlug = (tournament: SeasonLike): string => slugify(seriesName(tournament))
export const seasonSlug = (tournament: SeasonLike): string => slugify(seasonLabel(tournament))

/** The canonical public address of one season. */
export const getSeasonUrl = (tournament: SeasonLike, organizer: { name: string }): string =>
  `/${slugify(organizer.name)}/${seriesSlug(tournament)}/${seasonSlug(tournament)}`

/** The competition's address, which always opens whichever season is current. */
export const getSeriesUrl = (tournament: SeasonLike, organizer: { name: string }): string =>
  `/${slugify(organizer.name)}/${seriesSlug(tournament)}`

/**
 * The same two addresses, for a page that may not have the organizer to hand.
 *
 * Both are built from the organizer's name, and whoever is looking is not
 * always administering one: the super admin administers all of them, and a
 * competition whose organizer was deleted has none at all. The id route is the
 * fallback — uglier, and it still opens.
 */
export const adminSeasonUrl = (
  tournament: SluggableTournament & SeasonLike,
  organizer: { name: string } | null | undefined,
): string =>
  organizer ? getAdminTournamentUrl(tournament, organizer) : `/tournaments/${tournament.id}`

export const publicSeasonUrl = (
  tournament: SluggableTournament & SeasonLike,
  organizer: { name: string } | null | undefined,
): string =>
  organizer ? getSeasonUrl(tournament, organizer) : `/public/tournaments/${tournament.id}`

const scored = (match: Match) =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/** Every match of a tournament, including playoff rounds built by hand. */
export function seasonMatches(tournament: Tournament): Match[] {
  const matches: Match[] = [...(tournament.matches || [])]

  for (const round of tournament.format?.customPlayoffConfig?.playoffRounds || []) {
    for (const match of round.matches || []) {
      matches.push({ ...(match as unknown as Match), isPlayoff: true })
    }
  }

  return matches
}

export function seasonStatus(tournament: Tournament): SeasonStatus {
  const matches = seasonMatches(tournament)
  const played = matches.filter(scored).length
  if (matches.length === 0 || played === 0) return 'upcoming'
  return played === matches.length ? 'finished' : 'running'
}

/**
 * Who won.
 *
 * A knockout is decided by its last match and a league by its table, and a
 * league with finals bolted on is decided by the finals — so the answer depends
 * on the format. An organiser can override it, because a season is sometimes
 * settled by a withdrawal or a decision rather than by a result.
 */
export function championOf(tournament: Tournament): string | undefined {
  if (tournament.championTeamId) return tournament.championTeamId
  if (seasonStatus(tournament) !== 'finished') return undefined

  const matches = seasonMatches(tournament)
  const decider = lastDecidedMatch(matches.filter((match) => match.isPlayoff))

  if (decider) {
    if (decider.homeGoals! > decider.awayGoals!) return decider.homeTeamId
    if (decider.homeGoals! < decider.awayGoals!) return decider.awayTeamId
    // A drawn final decides nothing on its own; fall through to the table.
  }

  if (tournament.format?.mode === 'knockout') {
    const final = lastDecidedMatch(matches)
    if (!final) return undefined
    return final.homeGoals! > final.awayGoals! ? final.homeTeamId : final.awayTeamId
  }

  const league = matches.filter((match) => !match.isPlayoff)
  const table = (tournament.teamIds || []).map((teamId) =>
    calculateTeamStandings(league.length > 0 ? league : matches, teamId),
  )
  return sortTeamsByStandings(table)[0]?.teamId
}

/** The last match with a result, by kick-off and then by round. */
function lastDecidedMatch(matches: Match[]): Match | undefined {
  const played = matches.filter(scored)
  if (played.length === 0) return undefined

  return [...played].sort((a, b) => {
    const left = a.dateISO ? new Date(a.dateISO).getTime() : Number.NaN
    const right = b.dateISO ? new Date(b.dateISO).getTime() : Number.NaN
    if (!Number.isNaN(left) && !Number.isNaN(right) && left !== right) return right - left
    return (b.round ?? b.playoffRound ?? 0) - (a.round ?? a.playoffRound ?? 0)
  })[0]
}

/**
 * The season a visitor should land on: the newest one still being played, or
 * the newest one there is.
 */
export function currentSeason<T extends TournamentSummary>(seasons: T[]): T | undefined {
  const newestFirst = [...seasons].sort(
    (a, b) => new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
  )
  return newestFirst.find((season) => season.status !== 'finished') ?? newestFirst[0]
}

/** Seasons of one competition, newest first. */
export function seasonsOf<T extends SeasonLike>(all: T[], tournament: SeasonLike): T[] {
  const key = seriesKey(tournament)
  return all
    .filter((candidate) => seriesKey(candidate) === key)
    .sort(
      (a, b) => new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
    )
}

/** Every competition of an organiser, each with its seasons. */
export function groupIntoSeries<T extends SeasonLike>(all: T[]): Array<{ key: string; name: string; seasons: T[] }> {
  const groups = new Map<string, T[]>()

  for (const tournament of all) {
    const key = seriesKey(tournament)
    groups.set(key, [...(groups.get(key) || []), tournament])
  }

  return [...groups.entries()]
    .map(([key, seasons]) => ({
      key,
      name: seriesName(seasons[0]),
      seasons: seasons.sort(
        (a, b) => new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The label to suggest for the season after this one. */
export function nextSeasonLabel(previous: SeasonLike): string {
  const label = seasonLabel(previous)
  const year = label.match(/(19|20)\d{2}/)
  if (year) return label.replace(year[0], String(Number(year[0]) + 1))
  return `${label} II`
}
