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
import { cached, defaultTtl, invalidate, type ReadOptions } from './lib/cache.js'
import { generateId } from './lib/passwords.js'
import { badRequest, notFound } from './lib/http.js'
import { locateMatch } from './lib/matches.js'
import type { Organizer, Team, Tournament } from './lib/types.js'

/* ------------------------------------------------------------------ *
 * Organizers
 * ------------------------------------------------------------------ */

export const organizers = {
  async list(read?: ReadOptions): Promise<Organizer[]> {
    return cached('organizers:all', defaultTtl, () => scanAll<Organizer>(TABLES.ORGANIZERS), read)
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
  async listByOrganizer(organizerId: string, read?: ReadOptions): Promise<Team[]> {
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
    }, read)
  },

  async listAll(read?: ReadOptions): Promise<Team[]> {
    return cached('teams:all', defaultTtl, () => scanAll<Team>(TABLES.TEAMS), read)
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
    // JSON has no undefined, so a field a manager emptied on screen cannot be
    // sent as "absent" — it would simply keep its old value. `null` is how the
    // client says "clear this", and it is dropped rather than stored, so the
    // record never grows a key whose value means "no value".
    const fields = merged as Record<string, unknown>
    for (const [field, value] of Object.entries(updates)) {
      if (value === null) delete fields[field]
    }

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

/**
 * The document path of the rounds an organiser builds by hand, and its aliases.
 *
 * `format` and `matches` are DynamoDB reserved words. The rest is aliased with
 * them because a path assembled in code is invisible to `expressions.test.ts`:
 * an interpolation is a value as far as that check can tell.
 */
const ROUND_NAMES: Record<string, string> = {
  '#format': 'format',
  '#playoffConfig': 'customPlayoffConfig',
  '#playoffRounds': 'playoffRounds',
}
const ROUNDS = '#format.#playoffConfig.#playoffRounds'

/** Which round the caller believed they were editing. */
export type RoundExpectation = { roundNumber?: number; name?: string }

/** `format.customPlayoffConfig`, when the competition has one. */
function playoffConfig(tournament: Tournament): Record<string, unknown> | undefined {
  const format = tournament.format as Record<string, unknown> | undefined
  const config = format?.customPlayoffConfig
  if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined
  return config as Record<string, unknown>
}

const roundMoved = () =>
  notFound('This competition has changed since the page was loaded. Reload and try again.')

/**
 * What a write to one round asserts about the round it is writing to.
 *
 * The index came from a list the caller read a moment ago, and rounds move: a
 * round deleted in another tab shifts every round after it up by one, so index
 * 1 stops being the round the person clicked. The expectation therefore comes
 * from the *request* — the number or the name that was on screen — and is
 * checked twice: against the stored round here, and again in the condition of
 * the write, which is what covers the gap between the two.
 *
 * A round from before `roundNumber` existed is identified by its name instead.
 * Refusing when the caller offers neither is deliberate: without one, an index
 * is a guess, and the guess deletes somebody's fixtures.
 */
function guardForRound(
  round: Record<string, unknown>,
  index: number,
  expected: RoundExpectation,
  names: Record<string, string>,
  values: Record<string, unknown>,
): string {
  if (typeof expected.roundNumber === 'number') {
    if (round.roundNumber !== expected.roundNumber) throw roundMoved()
    names['#roundNumber'] = 'roundNumber'
    values[':expectedRound'] = expected.roundNumber
    return `${ROUNDS}[${index}].#roundNumber = :expectedRound`
  }

  if (typeof expected.name === 'string') {
    if (round.name !== expected.name) throw roundMoved()
    names['#roundName'] = 'name'
    values[':expectedName'] = expected.name
    return `${ROUNDS}[${index}].#roundName = :expectedName`
  }

  throw badRequest('Which round is being edited was not stated')
}

/**
 * A write whose condition failing means the screen is out of date.
 *
 * Retrying against whatever is there now would be guessing at what the person
 * meant — a round they were renaming may have been deleted — so the answer says
 * what happened instead.
 */
async function conditionally(command: UpdateCommand): Promise<void> {
  try {
    await ddb.send(command)
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    throw roundMoved()
  }
}

export const tournaments = {
  async listAll(read?: ReadOptions): Promise<Tournament[]> {
    return cached('tournaments:all', defaultTtl, () => scanAll<Tournament>(TABLES.TOURNAMENTS), read)
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

  async listByOrganizer(organizerId: string, read?: ReadOptions): Promise<Tournament[]> {
    return cached(`tournaments:organizer:${organizerId}`, defaultTtl, async () => {
      return queryAll<Tournament>({
        TableName: TABLES.TOURNAMENTS,
        IndexName: 'organizerId-index',
        KeyConditionExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: { ':organizerId': organizerId },
      })
    }, read)
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
   * Puts one club into the competition, once.
   *
   * Deliberately not `update({ teamIds })` from a list read a moment earlier:
   * the whole list gets written, and two writers — an organizer accepting an
   * application while another club claims an invitation, or the settings screen
   * saving a line-up — silently undo each other. Appending under a condition
   * lets DynamoDB decide, and returning false rather than throwing keeps
   * "already in" as an ordinary answer instead of an error to interpret.
   */
  async addTeam(tournamentId: string, teamId: string): Promise<boolean> {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TOURNAMENTS,
          Key: { id: tournamentId },
          UpdateExpression: 'SET #teamIds = list_append(if_not_exists(#teamIds, :empty), :one)',
          ConditionExpression:
            'attribute_exists(id) AND (attribute_not_exists(#teamIds) OR NOT contains(#teamIds, :teamId))',
          ExpressionAttributeNames: { '#teamIds': 'teamIds' },
          ExpressionAttributeValues: { ':empty': [], ':one': [teamId], ':teamId': teamId },
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
      throw error
    }

    invalidate('tournaments:')
    return true
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

  /**
   * Makes sure the `squads` map exists, so nested writes into it have somewhere
   * to land. Its own call so that a run of them can pay for it once instead of
   * once per club — switching a competition with two dozen clubs to a
   * registration list does all of them inside a single request.
   */
  async ensureSquads(tournamentId: string): Promise<void> {
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
    invalidate('tournaments:')
  },

  /**
   * Enters a club as it stands, but only if it has not been entered already.
   *
   * Used when a competition is switched to a registration list: every club that
   * has not chosen a squad has its current one written down, so the rule change
   * means "the lists are fixed from here" rather than "everybody out".
   *
   * The condition is the whole point of it existing beside `setSquad`. Which
   * clubs need entering is worked out from a read, and a manager saving their
   * own squad in the same second would otherwise be overwritten by a list this
   * call decided on before they saved. A club that has an entry by the time the
   * write lands keeps it, and the caller is told so rather than failing.
   */
  async enterSquadIfAbsent(
    tournamentId: string,
    teamId: string,
    playerIds: string[],
  ): Promise<boolean> {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TOURNAMENTS,
          Key: { id: tournamentId },
          ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(#squads.#team)',
          UpdateExpression: 'SET #squads.#team = :ids',
          ExpressionAttributeNames: { '#squads': 'squads', '#team': teamId },
          ExpressionAttributeValues: { ':ids': playerIds },
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
      throw error
    }

    invalidate('tournaments:')
    return true
  },

  /**
   * Applies a partial update to one match inside a tournament's matches array.
   *
   * One element, not the whole array. Writing `matches` back whole meant every
   * other fixture in the competition was rewritten from a copy read at the top
   * of this request, so a teamsheet or a score saved by somebody else in that
   * window was lost — on a match nobody was editing. The index is checked
   * against the match id in the same request, because a regenerated fixture
   * list reorders the array.
   *
   * The element is still replaced whole, so a concurrent write to this one
   * match can still be lost. That window is one request rather than one open
   * browser tab, and the fields with two authors — the teamsheets — are kept
   * out of this route entirely and written by `setLineup`.
   *
   * `locateMatch` finds the fixture in either place a competition keeps one.
   * A hand-built playoff round stores its matches inside the format, and until
   * this route could reach them their scores were edited by rewriting the whole
   * `format` object from the browser's copy.
   */
  async updateMatch(
    tournamentId: string,
    matchId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const tournament = await this.getOrThrow(tournamentId)
    const located = locateMatch(tournament, matchId)
    if (!located) throw notFound('Match not found in this tournament')

    const updated = { ...located.match, ...updates, id: matchId }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        // The path is assembled by `locateMatch`, which aliases every segment
        // of it: `matches` and `format` are both DynamoDB reserved words.
        UpdateExpression: `SET ${located.path} = :match`,
        ConditionExpression: `${located.path}.#id = :matchId`,
        ExpressionAttributeNames: { ...located.names, '#id': 'id' },
        ExpressionAttributeValues: { ':match': updated, ':matchId': matchId },
      }),
    )
    invalidate('tournaments:')
  },


  /**
   * A round the organiser builds by hand, appended.
   *
   * The screen that adds one used to write `format` whole, from the copy the
   * browser was holding — and the fixtures inside these rounds carry goals,
   * cards and the teamsheets a club's own manager writes. That is exactly the
   * write that used to undo a teamsheet through `matches`, one level deeper.
   * Appending under a condition on the length leaves every existing round, and
   * everything inside it, alone.
   *
   * The round's number and its fixtures' ids are assigned here rather than
   * taken from the request. The browser derives both from a list it read
   * earlier, and two fixtures with one id is a result saved onto the wrong
   * match. The number is one past the highest in use rather than one past the
   * length, because deleting a round does not renumber the ones after it.
   */
  async addPlayoffRound(
    tournamentId: string,
    round: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const tournament = await this.getOrThrow(tournamentId)
    const config = playoffConfig(tournament)
    if (!config) throw badRequest('This competition has no hand-built playoff rounds')

    const existing = Array.isArray(config.playoffRounds) ? config.playoffRounds : []
    if (existing.length >= 40) throw badRequest('This competition already has 40 playoff rounds')

    const highest = existing.reduce<number>((top, one) => {
      const number = (one as { roundNumber?: unknown } | null)?.roundNumber
      return typeof number === 'number' && number > top ? number : top
    }, 0)

    const fixtures = Array.isArray(round.matches) ? round.matches : []
    const stored = {
      ...round,
      roundNumber: highest + 1,
      quantityOfGames: fixtures.length,
      matches: fixtures.map((match) => ({ ...(match as object), id: generateId() })),
    }

    await conditionally(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression: `SET ${ROUNDS} = list_append(if_not_exists(${ROUNDS}, :none), :one)`,
        // `attribute_not_exists` on a nested path is true when the parent map is
        // missing too, and the SET would then fail with a ValidationException —
        // a 500 rather than an answer. So the parent is asserted as well.
        ConditionExpression: `attribute_exists(#format.#playoffConfig) AND (attribute_not_exists(${ROUNDS}) OR size(${ROUNDS}) = :count)`,
        ExpressionAttributeNames: { ...ROUND_NAMES },
        ExpressionAttributeValues: { ':none': [], ':one': [stored], ':count': existing.length },
      }),
    )

    invalidate('tournaments:')
    return stored
  },

  /**
   * One round's own fields: what it is called, and how many games it holds.
   *
   * The fixture list is never written back whole. A round that grows has empty
   * fixtures appended, a round that shrinks loses the ones at the end by index,
   * and a round whose count has not changed does not touch `matches` at all —
   * so a result or a teamsheet saved into this round while the screen was open
   * survives a rename, and survives somebody re-entering the same number of
   * games. Shrinking a round destroys the games at the end of it, which is what
   * shrinking a round means.
   */
  async updatePlayoffRound(
    tournamentId: string,
    index: number,
    updates: { name?: string; description?: string; quantityOfGames?: number },
    expected: RoundExpectation,
  ): Promise<Record<string, unknown>> {
    const tournament = await this.getOrThrow(tournamentId)
    const config = playoffConfig(tournament)
    const rounds = Array.isArray(config?.playoffRounds) ? config!.playoffRounds : []
    const round = rounds[index] as Record<string, unknown> | undefined
    if (!round) throw notFound('Round not found in this competition')

    const at = `${ROUNDS}[${index}]`
    const names: Record<string, string> = { ...ROUND_NAMES }
    const values: Record<string, unknown> = {}
    const sets: string[] = []
    const removes: string[] = []
    const conditions: string[] = [guardForRound(round, index, expected, names, values)]
    const merged: Record<string, unknown> = { ...round }

    if (typeof updates.name === 'string') {
      names['#roundName'] = 'name'
      values[':roundName'] = updates.name
      sets.push(`${at}.#roundName = :roundName`)
      merged.name = updates.name
    }

    if (typeof updates.description === 'string') {
      names['#description'] = 'description'
      values[':description'] = updates.description
      sets.push(`${at}.#description = :description`)
      merged.description = updates.description
    }

    if (typeof updates.quantityOfGames === 'number') {
      const quantity = Math.max(1, Math.min(20, Math.round(updates.quantityOfGames)))
      const fixtures = Array.isArray(round.matches) ? round.matches : []

      names['#quantityOfGames'] = 'quantityOfGames'
      values[':quantityOfGames'] = quantity
      sets.push(`${at}.#quantityOfGames = :quantityOfGames`)
      merged.quantityOfGames = quantity

      if (quantity !== fixtures.length) {
        names['#roundMatches'] = 'matches'
        values[':storedGames'] = fixtures.length
        conditions.push(
          `(attribute_not_exists(${at}.#roundMatches) OR size(${at}.#roundMatches) = :storedGames)`,
        )

        if (quantity > fixtures.length) {
          const added = Array.from({ length: quantity - fixtures.length }, () => ({
            id: generateId(),
            isElimination: false,
          }))
          values[':noGames'] = []
          values[':addedGames'] = added
          sets.push(
            `${at}.#roundMatches = list_append(if_not_exists(${at}.#roundMatches, :noGames), :addedGames)`,
          )
          merged.matches = [...fixtures, ...added]
        } else {
          // Highest index first: removing from the front would shift the rest
          // out from under the indexes named after it.
          for (let position = fixtures.length - 1; position >= quantity; position--) {
            removes.push(`${at}.#roundMatches[${position}]`)
          }
          merged.matches = fixtures.slice(0, quantity)
        }
      }
    }

    if (sets.length === 0 && removes.length === 0) throw badRequest('Nothing to change')

    await conditionally(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression:
          (sets.length > 0 ? `SET ${sets.join(', ')}` : '') +
          (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
        ConditionExpression: conditions.join(' AND '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    )

    invalidate('tournaments:')
    return merged
  },

  /** One round gone, by index, with the caller's idea of it checked first. */
  async removePlayoffRound(
    tournamentId: string,
    index: number,
    expected: RoundExpectation,
  ): Promise<void> {
    const tournament = await this.getOrThrow(tournamentId)
    const config = playoffConfig(tournament)
    const rounds = Array.isArray(config?.playoffRounds) ? config!.playoffRounds : []
    const round = rounds[index] as Record<string, unknown> | undefined
    if (!round) throw notFound('Round not found in this competition')

    const names: Record<string, string> = { ...ROUND_NAMES }
    const values: Record<string, unknown> = {}
    const guard = guardForRound(round, index, expected, names, values)

    await conditionally(
      new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression: `REMOVE ${ROUNDS}[${index}]`,
        ConditionExpression: guard,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    )

    invalidate('tournaments:')
  },
  /**
   * Who one club is naming for one match.
   *
   * Deliberately not `updateMatch({ lineups })`. That writes both halves of the
   * fixture from a copy read a moment earlier, and both halves now have their
   * own author: a manager saving their teamsheet while the organiser has the
   * match open would be undone by the organiser's next click, and the reverse.
   * Writing one side of one match lets DynamoDB merge the two, exactly as
   * `setSquad` does for the registrations that share one map.
   *
   * The condition is the whole point of the method. The route decided which
   * side the caller may write by reading the fixture; between that read and
   * this write the fixture can move underneath both. So the write asserts what
   * the permission was granted on — this match id, and this club still on this
   * side of it. A knockout fixture is the case that makes it necessary: saving
   * a result in the previous round rewrites `homeTeamId` of an existing match,
   * so the id alone would have let a club's eleven land on the home teamsheet
   * of a match they are no longer in. The position is checked the same way,
   * because a regenerated fixture list reorders the array.
   *
   * The path comes from `locateMatch`, so a fixture in a hand-built playoff
   * round — which lives inside the format, not in `matches` — takes a teamsheet
   * like any other.
   */
  async setLineup(
    tournamentId: string,
    matchId: string,
    teamId: string,
    side: 'home' | 'away',
    starting: string[],
  ): Promise<void> {
    const tournament = await this.getOrThrow(tournamentId)
    const located = locateMatch(tournament, matchId)
    if (!located) throw notFound('Match not found in this tournament')

    const existing = (located.match as { lineups?: Record<string, unknown> }).lineups
    const current = (existing?.[side] ?? {}) as { substitutes?: unknown }

    const names = {
      ...located.names,
      '#lineups': 'lineups',
      '#id': 'id',
      '#sideTeam': side === 'home' ? 'homeTeamId' : 'awayTeamId',
    }
    const guard = `${located.path}.#id = :matchId AND ${located.path}.#sideTeam = :teamId`

    try {
      // Two writes for the reason `setSquad` needs two: a nested path cannot be
      // created and written in the same expression, and DynamoDB rejects an
      // update that names overlapping paths.
      //
      // Both sides are created here, not just the one being written. Readers of
      // a teamsheet treat `lineups` as either absent or complete — the site's
      // own match page dereferences `lineups.home` and `lineups.away` the
      // moment `lineups` exists — so a record with one half would be a crash
      // rather than an empty list, and a failure between the two writes leaves
      // a shape everything can still read.
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TOURNAMENTS,
          Key: { id: tournamentId },
          UpdateExpression: `SET ${located.path}.#lineups = if_not_exists(${located.path}.#lineups, :both)`,
          ConditionExpression: guard,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: {
            ':both': {
              home: { starting: [], substitutes: [] },
              away: { starting: [], substitutes: [] },
            },
            ':matchId': matchId,
            ':teamId': teamId,
          },
        }),
      )

      // The side is written whole rather than field by field, and `substitutes`
      // is carried across: nothing edits it today, and a teamsheet saved here
      // must not quietly delete a list somebody may fill in later.
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TOURNAMENTS,
          Key: { id: tournamentId },
          UpdateExpression: `SET ${located.path}.#lineups.#side = :lineup`,
          ConditionExpression: guard,
          ExpressionAttributeNames: { ...names, '#side': side },
          ExpressionAttributeValues: {
            ':lineup': {
              starting,
              substitutes: Array.isArray(current.substitutes) ? current.substitutes : [],
            },
            ':matchId': matchId,
            ':teamId': teamId,
          },
        }),
      )
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // The fixture moved between the read and the write. Saying so is the
      // honest answer: the teamsheet was for a match that is no longer the one
      // being written to, and silently retrying against the new one would be
      // guessing at what the person meant.
      throw notFound('This fixture has changed since the page was loaded. Reload and try again.')
    }

    invalidate('tournaments:')
  },
}
