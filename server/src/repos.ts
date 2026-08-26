import {
  batchGetByIds,
  buildUpdate,
  ddb,
  DeleteCommand,
  GetCommand,
  PutCommand,
  queryAll,
  scanAll,
  UpdateCommand,
} from './lib/ddb.js'
import { TABLES } from './lib/env.js'
import { cached, defaultTtl, invalidate } from './lib/cache.js'
import { generateId } from './lib/passwords.js'
import { notFound } from './lib/http.js'
import type { Organizer, Team, Tournament } from './lib/types.js'

/* ------------------------------------------------------------------ *
 * Organizers
 * ------------------------------------------------------------------ */

export const organizers = {
  async list(): Promise<Organizer[]> {
    return cached('organizers:all', defaultTtl, () => scanAll<Organizer>(TABLES.ORGANIZERS))
  },

  async get(id: string): Promise<Organizer | null> {
    const result = await ddb.send(new GetCommand({ TableName: TABLES.ORGANIZERS, Key: { id } }))
    return (result.Item as Organizer | undefined) ?? null
  },

  async create(input: { name: string; email: string }): Promise<Organizer> {
    const organizer: Organizer = {
      id: generateId(),
      name: input.name,
      email: input.email,
      createdAtISO: new Date().toISOString(),
    }
    await ddb.send(new PutCommand({ TableName: TABLES.ORGANIZERS, Item: organizer }))
    invalidate('organizers:')
    return organizer
  },

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const expression = buildUpdate(updates, ['id', 'createdAtISO'])
    if (!expression) return
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.ORGANIZERS,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)',
        ...expression,
      }),
    )
    invalidate('organizers:')
  },

  async remove(id: string): Promise<void> {
    await ddb.send(new DeleteCommand({ TableName: TABLES.ORGANIZERS, Key: { id } }))
    invalidate('organizers:')
  },
}

/* ------------------------------------------------------------------ *
 * Teams
 * ------------------------------------------------------------------ */

export const teams = {
  async listByOrganizer(organizerId: string): Promise<Team[]> {
    return cached(`teams:organizer:${organizerId}`, defaultTtl, async () => {
      // organizerId-index keeps this a Query instead of a full-table Scan, which
      // is the difference between paying for one organizer's teams and paying
      // for every team in the system on each request.
      return queryAll<Team>({
        TableName: TABLES.TEAMS,
        IndexName: 'organizerId-index',
        KeyConditionExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: { ':organizerId': organizerId },
      })
    })
  },

  async listAll(): Promise<Team[]> {
    return cached('teams:all', defaultTtl, () => scanAll<Team>(TABLES.TEAMS))
  },

  async getMany(ids: string[]): Promise<Team[]> {
    return batchGetByIds<Team>(TABLES.TEAMS, ids)
  },

  async get(id: string): Promise<Team | null> {
    const result = await ddb.send(new GetCommand({ TableName: TABLES.TEAMS, Key: { id } }))
    return (result.Item as Team | undefined) ?? null
  },

  async create(input: Record<string, unknown> & { organizerId: string }): Promise<Team> {
    const team = {
      ...input,
      id: generateId(),
      createdAtISO: new Date().toISOString(),
    } as unknown as Team
    await ddb.send(new PutCommand({ TableName: TABLES.TEAMS, Item: team }))
    invalidate('teams:')
    return team
  },

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const expression = buildUpdate(updates, ['id', 'createdAtISO'])
    if (!expression) return
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)',
        ...expression,
      }),
    )
    invalidate('teams:')
  },

  async remove(id: string): Promise<void> {
    await ddb.send(new DeleteCommand({ TableName: TABLES.TEAMS, Key: { id } }))
    invalidate('teams:')
  },

  async getOrThrow(id: string): Promise<Team> {
    const team = await this.get(id)
    if (!team) throw notFound('Team not found')
    return team
  },

  async addPlayer(teamId: string, player: Record<string, unknown>): Promise<Record<string, unknown>> {
    const created = {
      ...player,
      id: generateId(),
      createdAtISO: new Date().toISOString(),
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        // list_append appends to whatever is stored right now, so two people
        // adding a player at the same time both get theirs.
        UpdateExpression:
          'SET #players = list_append(if_not_exists(#players, :empty), :player)',
        ExpressionAttributeNames: { '#players': 'players' },
        ExpressionAttributeValues: { ':player': [created], ':empty': [] },
        ConditionExpression: 'attribute_exists(id)',
      }),
    )
    invalidate('teams:')
    return created
  },

  /**
   * Updates ONE player inside a team.
   *
   * The whole point is the UpdateExpression below: it writes a single element of
   * the players list instead of sending the entire array back. When the old code
   * saved a player it rewrote every player on the team, so two edits in flight at
   * once — or two tabs, or two people — silently overwrote each other. The
   * condition re-checks that the element at this index is still the player we
   * looked up, so a concurrent insert or delete makes the write fail loudly
   * rather than land on somebody else's row.
   */
  async updatePlayer(
    teamId: string,
    playerId: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const team = await this.getOrThrow(teamId)
    const players = (Array.isArray(team.players) ? team.players : []) as Record<string, unknown>[]
    const index = players.findIndex((player) => player?.id === playerId)
    if (index === -1) throw notFound('Player not found in this team')

    const merged = { ...players[index], ...updates, id: playerId }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        UpdateExpression: `SET #players[${index}] = :player`,
        ConditionExpression: `#players[${index}].#playerId = :playerId`,
        ExpressionAttributeNames: { '#players': 'players', '#playerId': 'id' },
        ExpressionAttributeValues: { ':player': merged, ':playerId': playerId },
      }),
    )
    invalidate('teams:')
    return merged
  },

  async removePlayer(teamId: string, playerId: string): Promise<void> {
    const team = await this.getOrThrow(teamId)
    const players = (Array.isArray(team.players) ? team.players : []) as Record<string, unknown>[]
    const index = players.findIndex((player) => player?.id === playerId)
    if (index === -1) throw notFound('Player not found in this team')

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        UpdateExpression: `REMOVE #players[${index}]`,
        ConditionExpression: `#players[${index}].#playerId = :playerId`,
        ExpressionAttributeNames: { '#players': 'players', '#playerId': 'id' },
        ExpressionAttributeValues: { ':playerId': playerId },
      }),
    )
    invalidate('teams:')
  },
}

/* ------------------------------------------------------------------ *
 * Tournaments
 * ------------------------------------------------------------------ */

/** The fields a listing page needs. Full tournaments carry every match and are large. */
export type TournamentSummary = Pick<
  Tournament,
  'id' | 'name' | 'organizerId' | 'createdAtISO' | 'visibility'
> & {
  logo?: string
  teamCount: number
  /** Season fields, so a listing can group and label without fetching matches. */
  seriesId?: string
  seriesName?: string
  seasonLabel?: string
  championTeamId?: string
  /** How far along the season is, worked out here so every page agrees. */
  status: 'upcoming' | 'running' | 'finished'
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

/** Played, in the one sense the whole app uses: a score has been entered. */
export function seasonStatus(tournament: Tournament): 'upcoming' | 'running' | 'finished' {
  const matches = Array.isArray(tournament.matches) ? tournament.matches : []
  const scored = matches.filter((match) => {
    const m = match as { homeGoals?: unknown; awayGoals?: unknown }
    return typeof m.homeGoals === 'number' && typeof m.awayGoals === 'number'
  }).length

  if (matches.length === 0 || scored === 0) return 'upcoming'
  return scored === matches.length ? 'finished' : 'running'
}

export function toSummary(tournament: Tournament): TournamentSummary {
  return {
    id: tournament.id,
    name: tournament.name,
    organizerId: tournament.organizerId,
    createdAtISO: tournament.createdAtISO,
    visibility: tournament.visibility,
    logo: tournament.logo as string | undefined,
    teamCount: Array.isArray(tournament.teamIds) ? tournament.teamIds.length : 0,
    seriesId: asString(tournament.seriesId) ?? tournament.id,
    seriesName: asString(tournament.seriesName) ?? tournament.name,
    seasonLabel: asString(tournament.seasonLabel),
    championTeamId: asString(tournament.championTeamId),
    status: seasonStatus(tournament),
  }
}

export const isPublic = (tournament: Tournament): boolean => tournament.visibility !== 'private'

export const tournaments = {
  async listAll(): Promise<Tournament[]> {
    return cached('tournaments:all', defaultTtl, () => scanAll<Tournament>(TABLES.TOURNAMENTS))
  },

  /**
   * Summaries for public listing pages, with private tournaments removed on the
   * server. Previously "private" only hid a card in React while the full row
   * was already in the browser.
   */
  async listPublicSummaries(): Promise<TournamentSummary[]> {
    const all = await this.listAll()
    return all.filter(isPublic).map(toSummary)
  },

  async listByOrganizer(organizerId: string): Promise<Tournament[]> {
    return cached(`tournaments:organizer:${organizerId}`, defaultTtl, async () => {
      return queryAll<Tournament>({
        TableName: TABLES.TOURNAMENTS,
        IndexName: 'organizerId-index',
        KeyConditionExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: { ':organizerId': organizerId },
      })
    })
  },

  async get(id: string): Promise<Tournament | null> {
    const result = await ddb.send(new GetCommand({ TableName: TABLES.TOURNAMENTS, Key: { id } }))
    return (result.Item as Tournament | undefined) ?? null
  },

  async getOrThrow(id: string): Promise<Tournament> {
    const tournament = await this.get(id)
    if (!tournament) throw notFound('Tournament not found')
    return tournament
  },

  async create(input: Record<string, unknown> & { organizerId: string }): Promise<Tournament> {
    const tournament = {
      teamIds: [],
      matches: [],
      ...input,
      id: generateId(),
      createdAtISO: new Date().toISOString(),
    } as unknown as Tournament
    await ddb.send(new PutCommand({ TableName: TABLES.TOURNAMENTS, Item: tournament }))
    invalidate('tournaments:')
    return tournament
  },

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const expression = buildUpdate(updates, ['id', 'createdAtISO', 'organizerId'])
    if (!expression) return
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)',
        ...expression,
      }),
    )
    invalidate('tournaments:')
  },

  async remove(id: string): Promise<void> {
    await ddb.send(new DeleteCommand({ TableName: TABLES.TOURNAMENTS, Key: { id } }))
    invalidate('tournaments:')
  },

  /**
   * Sets which of one club's players are registered for this competition.
   *
   * Deliberately not `update({ squads })`: every club in the competition shares
   * that one map, and writing it whole means two managers saving their squads
   * within the same minute would silently erase each other — the second read
   * happened before the first write landed. Writing a single key inside the map
   * lets DynamoDB merge them, so each manager only ever touches their own club.
   *
   * `playerIds` of null means "no selection", which the rest of the app reads as
   * the whole squad.
   */
  async setSquad(
    tournamentId: string,
    teamId: string,
    playerIds: string[] | null,
  ): Promise<void> {
    // A nested path cannot be written until the map it lives in exists, and the
    // two cannot be done in one expression — DynamoDB rejects overlapping paths.
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        ConditionExpression: 'attribute_exists(id)',
        UpdateExpression: 'SET #squads = if_not_exists(#squads, :empty)',
        ExpressionAttributeNames: { '#squads': 'squads' },
        ExpressionAttributeValues: { ':empty': {} },
      }),
    )

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        ConditionExpression: 'attribute_exists(id)',
        UpdateExpression:
          playerIds === null ? 'REMOVE #squads.#team' : 'SET #squads.#team = :ids',
        ExpressionAttributeNames: { '#squads': 'squads', '#team': teamId },
        ...(playerIds === null ? {} : { ExpressionAttributeValues: { ':ids': playerIds } }),
      }),
    )

    invalidate('tournaments:')
  },

  /** Applies a partial update to one match inside a tournament's matches array. */
  async updateMatch(
    tournamentId: string,
    matchId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const tournament = await this.getOrThrow(tournamentId)
    const matches = Array.isArray(tournament.matches) ? [...tournament.matches] : []
    const index = matches.findIndex(
      (match) => (match as { id?: string } | null)?.id === matchId,
    )
    if (index === -1) throw notFound('Match not found in this tournament')

    matches[index] = { ...(matches[index] as object), ...updates, id: matchId }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        // `matches` is a DynamoDB reserved word, hence the alias.
        UpdateExpression: 'SET #matches = :matches',
        ExpressionAttributeNames: { '#matches': 'matches' },
        ExpressionAttributeValues: { ':matches': matches },
        ConditionExpression: 'attribute_exists(id)',
      }),
    )
    invalidate('tournaments:')
  },
}
