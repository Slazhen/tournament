/**
 * Which group a group-stage fixture belongs to, decided by the two clubs on it.
 *
 * `groupIndex` on a fixture is a copy of something the season already knows:
 * `format.groupsWithDivisionsConfig.groups` says who is in which group, and the
 * pairing says which two clubs play. The copy was written once, by the
 * generator, as the number of the slot it drew the fixture in - and nothing
 * moved it when an organiser changed the clubs on that fixture to match the
 * real draw. The AAFA season of 2026 had every group-stage fixture re-paired by
 * hand that way, so its results sat under somebody else's group and the tables
 * counted only the ones where the slot happened to agree.
 *
 * So the server derives it wherever a pairing is written, and never takes the
 * browser's word for it while the pairing answers the question. A pairing that
 * does not sit inside one group - a side still empty, or half of a re-pairing
 * saved one club at a time - keeps whatever number it had, because there is no
 * better answer to write and taking it away would lose the one it had.
 */

import { badRequest } from './http.js'

type Fixture = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored groups, read defensively: `format` is passed through whole by two routes. */
export function groupsOfFormat(format: unknown): string[][] {
  if (!isRecord(format) || format.mode !== 'groups_with_divisions') return []
  const config = format.groupsWithDivisionsConfig
  if (!isRecord(config) || !Array.isArray(config.groups)) return []
  return config.groups.map((group) =>
    Array.isArray(group) ? group.filter((id): id is string => typeof id === 'string') : [],
  )
}

/** The 1-based group both clubs are in, or undefined where they are not in one. */
export function groupIndexOf(groups: string[][], homeTeamId: unknown, awayTeamId: unknown): number | undefined {
  if (typeof homeTeamId !== 'string' || typeof awayTeamId !== 'string') return undefined
  if (!homeTeamId || !awayTeamId) return undefined
  const index = groups.findIndex((ids) => ids.includes(homeTeamId) && ids.includes(awayTeamId))
  return index >= 0 ? index + 1 : undefined
}

/**
 * The number a fixture should carry once `updates` are applied to `stored`,
 * or undefined where the pairing does not decide it. A playoff fixture has no
 * group whatever its clubs are.
 */
export function derivedGroupIndex(
  groups: string[][],
  stored: Fixture,
  updates: Fixture,
): number | undefined {
  const isPlayoff = 'isPlayoff' in updates ? updates.isPlayoff : stored.isPlayoff
  if (isPlayoff) return undefined
  const home = 'homeTeamId' in updates ? updates.homeTeamId : stored.homeTeamId
  const away = 'awayTeamId' in updates ? updates.awayTeamId : stored.awayTeamId
  return groupIndexOf(groups, home, away)
}

/**
 * Every group-stage fixture in a body that writes `matches` whole, numbered by
 * its pairing. `format` is the one the write will leave on the season: the
 * body's where it sends one, the stored one otherwise.
 */
export function alignGroupIndexes(
  body: Record<string, unknown>,
  storedFormat: unknown,
): Record<string, unknown> {
  if (!Array.isArray(body.matches)) return body
  const groups = groupsOfFormat('format' in body ? body.format : storedFormat)
  if (groups.length === 0) return body

  const matches = body.matches.map((match) => {
    if (!isRecord(match)) return match
    const number = derivedGroupIndex(groups, match, {})
    return number === undefined || match.groupIndex === number ? match : { ...match, groupIndex: number }
  })
  return { ...body, matches }
}

const sameGroups = (a: string[][], b: string[][]) =>
  a.length === b.length &&
  a.every((group, index) => {
    const other = [...b[index]].sort()
    const mine = [...group].sort()
    return mine.length === other.length && mine.every((id, at) => id === other[at])
  })

/**
 * Refuses a write that moves clubs between groups and leaves the fixtures
 * where they were.
 *
 * Every screen that changes who is in which group sends the fixtures it
 * rebuilt in the same body, and `alignGroupIndexes` numbers them from the new
 * groups. A body carrying `format` alone would store groups the fixtures'
 * numbers no longer agree with, and nothing would put them back in step. The
 * one format-only write the site makes is `persistReconstructedGroups`, which
 * stores groups on a season that had none, worked out from those very numbers
 * - so a season with no stored groups is let through.
 */
export function assertGroupsMoveWithFixtures(body: Record<string, unknown>, storedFormat: unknown): void {
  if (!('format' in body) || Array.isArray(body.matches)) return
  const stored = groupsOfFormat(storedFormat)
  if (stored.length === 0) return
  if (sameGroups(stored, groupsOfFormat(body.format))) return
  throw badRequest('The groups can only be changed together with the fixtures. Reload and try again.')
}
