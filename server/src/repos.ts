import {
  batchGetByIds,
  buildUpdate,
  ddb,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
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
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLES.TEAMS,
          IndexName: 'organizerId-index',
          KeyConditionExpression: 'organizerId = :organizerId',
          ExpressionAttributeValues: { ':organizerId': organizerId },
        }),
      )
      return (result.Items ?? []) as Team[]
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
> & { logo?: string; teamCount: number }

function toSummary(tournament: Tournament): TournamentSummary {
  return {
    id: tournament.id,
    name: tournament.name,
    organizerId: tournament.organizerId,
    createdAtISO: tournament.createdAtISO,
    visibility: tournament.visibility,
    logo: tournament.logo as string | undefined,
    teamCount: Array.isArray(tournament.teamIds) ? tournament.teamIds.length : 0,
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
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLES.TOURNAMENTS,
          IndexName: 'organizerId-index',
          KeyConditionExpression: 'organizerId = :organizerId',
          ExpressionAttributeValues: { ':organizerId': organizerId },
        }),
      )
      return (result.Items ?? []) as Tournament[]
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
