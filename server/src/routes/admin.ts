import { ddb, PutCommand, DeleteCommand, UpdateCommand, scanAll } from '../lib/ddb.js'
import { TABLES } from '../lib/env.js'
import { badRequest, forbidden, notFound } from '../lib/http.js'
import {
  assertCanAccessOrganizer,
  assertManagesTeam,
  assertSuperAdmin,
  isClaimedTeam,
  isSuperAdmin,
} from '../lib/auth.js'
import {
  assertPasswordStrength,
  generateId,
  generateSalt,
  hashPassword,
} from '../lib/passwords.js'
import { deleteAllUserSessions } from '../lib/sessions.js'
import { toPublicUser, type AuthUser, type Team } from '../lib/types.js'
import { organizers, teams, tournaments } from '../repos.js'
import {
  deleteEntriesForTeam,
  deleteEntriesForTournament,
  deleteInvitesOfOrganizer,
  entriesForTeam,
  getEntry,
  linkManagerToTeam,
  unlinkManagerFromTeam,
  unlinkOwnerManagers,
} from '../repos-clubs.js'
import {
  nameableInMatch,
  pickLineup,
  refusedByRegistration,
  sideOfTeam,
} from '../lib/lineups.js'
import { assertCompetitionColours, assertTeamColours } from '../lib/colours.js'
import { locateMatch } from '../lib/matches.js'
import { chooseSquad, isStrict, squadPlayerIds } from '../lib/squads.js'
import { findUserByCredential } from './auth.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'
import { record, recent } from '../lib/audit.js'
import { adminRead, liveRead } from '../lib/cache.js'
import { issueResetToken } from '../lib/resets.js'
import { SITE_URL } from '../lib/env.js'
import { sendPasswordReset } from '../lib/mail.js'

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${field} is required`)
  }
  return value.trim()
}

/**
 * The organizer a write is being made against.
 *
 * An organizer may only name their own id; the super admin may name any. This
 * is what stops one organizer from creating or editing another's data — a check
 * that simply did not exist while the browser held write credentials.
 */
function resolveOrganizerId(user: AuthUser, requested: unknown): string {
  if (isSuperAdmin(user)) return requireString(requested, 'organizerId')
  const own = user.organizerId
  if (!own) throw badRequest('This account is not linked to an organizer')
  if (typeof requested === 'string' && requested && requested !== own) {
    assertCanAccessOrganizer(user, requested)
  }
  return own
}


/**
 * The fields of a club anyone may edit through the API.
 *
 * A whitelist rather than a blacklist: the club record is schemaless, so
 * anything not named here would otherwise be persisted on it by whoever asked.
 */
const TEAM_FIELDS = [
  'name',
  'colors',
  'logo',
  // Read from the crest by the browser that uploaded it — the image goes
  // straight to S3 with a presigned POST, so the API never sees the bytes and
  // cannot work these out for itself. The public club header is painted from
  // them; `src/utils/crest.ts` explains why not from `colors`.
  'crestColor',
  'crestOpaqueBackground',
  'photo',
  'socialMedia',
  'establishedDate',
  // Whether the public is told how old this club's players are. A club-wide
  // decision, so it lives here and not on each player.
  'hidePlayerAges',
  // Whether other organisers may find this club and invite it. The club's own
  // decision — `assertManagesTeam` guards the write, so it is the managers who
  // set it, or the owning organiser while the club has none.
  'discoverable',
] as const

/**
 * The club flags where a wrong value is not a wrong display but a wrong
 * decision.
 *
 * Absent means "no" for both, so anything that is not a boolean — a null, which
 * clears the field, or the string "false", which is truthy — would either
 * publish a club that did not ask to be listed or quietly unlist one that did.
 * The same rule `isPublic` follows on a player, and for the same reason.
 */
function assertClubFlags(updates: Record<string, unknown>): void {
  for (const field of ['discoverable', 'hidePlayerAges'] as const) {
    if (updates[field] !== undefined && typeof updates[field] !== 'boolean') {
      throw badRequest(`${field} must be true or false`)
    }
  }
}

/**
 * What may be written about one player.
 *
 * The PATCH below used to hand its body to the store untouched. These records
 * are schemaless, so whatever anybody sent was persisted onto the player —
 * the same hole `TEAM_FIELDS` and `MATCH_FIELDS` exist to close, and the one
 * place in the API that still had it open.
 *
 * `null` means "clear this": JSON has no undefined, so a number a manager
 * emptied on screen arrives as nothing at all and would keep its old value.
 */
const PLAYER_FIELDS = [
  'firstName',
  'lastName',
  'number',
  'position',
  'dateOfBirth',
  'heightCm',
  'weightKg',
  'preferredFoot',
  'photo',
  'socialMedia',
  'isPublic',
] as const

const FEET = new Set(['left', 'right', 'both'])

/**
 * The player fields worth typing, checked.
 *
 * A height of "very tall" or a shirt number of NaN is a page that renders
 * nonsense for as long as nobody notices, and these records have no schema to
 * catch it later.
 */
function playerUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates = pick(body, PLAYER_FIELDS)

  for (const field of ['number', 'heightCm', 'weightKg'] as const) {
    const value = updates[field]
    if (value === undefined || value === null) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw badRequest(`${field} must be a number`)
    }
  }

  const foot = updates.preferredFoot
  if (foot !== undefined && foot !== null && !FEET.has(foot as string)) {
    throw badRequest('preferredFoot must be left, right or both')
  }

  // `isPublic` is the one field where a wrong value publishes somebody who
  // asked not to be published: absent means public, so a null — which clears
  // the field — and a string "false" both read as "show this player". It is a
  // boolean or it is not sent.
  if (updates.isPublic !== undefined && typeof updates.isPublic !== 'boolean') {
    throw badRequest('isPublic must be true or false')
  }

  return updates
}

/** The same list, with the clearing nulls dropped: a new player has nothing to clear. */
function newPlayerFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(playerUpdates(body)).filter(([, value]) => value !== null),
  )
}

// `players` is deliberately absent. A squad is a list, and a list written back
// whole loses whatever a second writer put there in the meantime — the same
// failure that cost `managerUserIds` a removal and `teamIds` an entry. The
// three routes below write one player at a time, under a condition, and they
// are the only way in.

/**
 * What the organiser may change about one fixture.
 *
 * Named for the same reason `TEAM_FIELDS` is: the records are schemaless, so a
 * key nobody has invented yet would be persisted onto the match by whoever
 * asked for it.
 *
 * `lineups` is deliberately absent. Both halves of a teamsheet now have their
 * own author — the organiser and the club's own manager — and this route
 * writes the whole match from the copy the browser is holding, so a `lineups`
 * sent here would carry a stale opposing eleven over one saved a moment ago.
 * The lineup route below writes one side at a time, and it is the only way in.
 */
const MATCH_FIELDS = [
  'homeTeamId',
  'awayTeamId',
  'dateISO',
  'homeGoals',
  'awayGoals',
  'round',
  'isPlayoff',
  'playoffRound',
  'playoffMatch',
  'isElimination',
  'division',
  'groupIndex',
  'venue',
  'referee',
  // The kick-off of a hand-built playoff fixture, which keeps its day and its
  // time in separate fields.
  'time',
  'status',
  'statistics',
  'goals',
  'cards',
  'preview',
  'report',
  'videoUrl',
] as const

function pick(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) out[field] = body[field]
  }
  return out
}

/**
 * Every login that administers one organizer.
 *
 * A scan rather than a query: the accounts table is indexed by email, which is
 * the only thing anybody signs in with, and it holds a handful of rows. An
 * index on `organizerId` would cost more to keep than this read costs to run.
 */
async function accountsOfOrganizer(organizerId: string): Promise<AuthUser[]> {
  const all = await scanAll<AuthUser>(TABLES.AUTH_USERS)
  return all.filter((account) => account.organizerId === organizerId)
}

/** A club's manager as the organizer who owns the club may see them. */
type ClubManager = {
  id: string
  email: string
  displayName?: string
  isActive: boolean
  /** Absent for clubs claimed before the date was recorded. */
  linkedAt?: string
}

/**
 * Who runs each of these clubs.
 *
 * `managerUserIds` is the list permissions are decided from, so it is the list
 * read here — the account's own `teamIds` is the same link written from the
 * other side, and showing the organizer a manager the server would not actually
 * let through would be worse than showing none.
 *
 * One scan of the accounts table for the whole set rather than a read per id: a
 * competition has twenty-odd clubs, and the table holds a handful of rows.
 */
async function managersOfTeams(list: Team[]): Promise<Record<string, ClubManager[]>> {
  const wanted = new Set<string>()
  for (const team of list) for (const id of team.managerUserIds ?? []) wanted.add(id)

  const byId = new Map<string, AuthUser>()
  if (wanted.size > 0) {
    for (const account of await scanAll<AuthUser>(TABLES.AUTH_USERS)) {
      if (wanted.has(account.id)) byId.set(account.id, account)
    }
  }

  const out: Record<string, ClubManager[]> = {}
  for (const team of list) {
    out[team.id] = (team.managerUserIds ?? [])
      .map((id): ClubManager => {
        const account = byId.get(id)
        // A link to an account that no longer exists is worth saying out loud:
        // it is the club nobody can edit and nobody can see why.
        if (!account) {
          return { id, email: '', isActive: false, linkedAt: team.managerLinkedAt?.[id] }
        }
        return {
          id: account.id,
          // Accounts old enough to predate email logins have a username and no
          // address. They are still the people running the club, so they are
          // listed; the organizer simply has nothing to write to.
          email: account.email ?? '',
          displayName: account.displayName,
          isActive: account.isActive !== false,
          linkedAt: team.managerLinkedAt?.[id],
        }
      })
      .sort((a, b) => (a.linkedAt ?? '').localeCompare(b.linkedAt ?? ''))
  }
  return out
}

/**
 * What of another organiser's club travels to the organiser it plays against.
 *
 * A named list and not a deletion of the fields that are sensitive today, for
 * the reason every projection in this API is: these records are schemaless and
 * `PATCH` persists whatever `TEAM_FIELDS` and `PLAYER_FIELDS` admit, so a field
 * added next year — `discoverable` was added this year — would otherwise reach
 * every organiser this club visits on the day it is written.
 *
 * Players hidden with `isPublic: false` are kept, unlike in the public
 * projection: this organiser names the teamsheets for this club and enters it
 * in the competition, and a player they cannot see is a player who cannot be
 * fielded. What is dropped is the date of birth, which a teamsheet has never
 * needed.
 */
const VISITING_TEAM_FIELDS = [
  'id',
  'name',
  'organizerId',
  'createdAtISO',
  'colors',
  'logo',
  'crestColor',
  'crestOpaqueBackground',
  'photo',
  'establishedDate',
  'socialMedia',
  'hidePlayerAges',
] as const

const VISITING_PLAYER_FIELDS = [
  'id',
  'firstName',
  'lastName',
  'number',
  'position',
  'heightCm',
  'weightKg',
  'preferredFoot',
  'photo',
  'socialMedia',
  'isPublic',
  'createdAtISO',
] as const

/**
 * Another organiser's club, as the organiser whose competition it plays in may
 * see it.
 *
 * The squad comes with it, and that is deliberate: entering a club in a
 * competition and naming who played for it are the organiser's to do for every
 * club in the season, claimed or not, and both are picked from this list. What
 * does not come is anything about the club as a club — `managerUserIds` is a
 * list of accounts the organiser has no standing over, which is why
 * `/admin/tournaments/:id/managers` already refuses to name them, and a date of
 * birth belongs to the club that holds it: a teamsheet needs a name, not a
 * birthday.
 *
 * `visiting` is the flag every screen reads to know this club is not theirs to
 * edit. The API refuses those writes anyway — `assertManagesTeam` sees another
 * organiser's club — so without it the editing controls were drawn and then
 * saved into a refusal.
 */
/**
 * Which clubs may be written into a competition's team list.
 *
 * `teamIds` is the one field on a tournament that names records belonging to
 * somebody else, and both the create and the `PATCH` pass their body through —
 * so an organiser could put any club id in the system into their own season.
 * That was untidy while a foreign id resolved to nothing; it stopped being
 * untidy when `/admin/teams` began returning the club behind it, because the
 * same request would then have handed over that club's squad, and the club's
 * own page would have shown it playing in a competition it never joined.
 *
 * A club is enterable if this organiser owns it, or if the club has agreed —
 * an entry marked accepted, whether the club applied or answered an invitation.
 * Ids already in the season are left where they are: some of them predate
 * entries altogether, and refusing them would leave a live season nobody can
 * save.
 *
 * The design problem underneath is that a tournament has never had a
 * `TEAM_FIELDS` of its own and this route writes what it is given. This closes
 * the field that names other people's records. It does not pay the debt.
 */
async function assertEnterableTeams(
  organizerId: string,
  tournamentId: string | null,
  wanted: unknown,
  already: string[],
): Promise<void> {
  if (!Array.isArray(wanted)) return
  // The list is written into the record whatever it holds, so an object or a
  // number in it is a club id nothing can ever resolve, sitting in a season
  // forever. The cap is not a rule about football; it is what stops a hand-made
  // request turning this check into a thousand reads.
  if (wanted.some((id) => typeof id !== 'string')) {
    throw badRequest('teamIds must be a list of club ids')
  }
  if (wanted.length > 200) throw badRequest('That is more clubs than one competition can hold')

  const held = new Set(already)
  const added = wanted.filter((id): id is string => typeof id === 'string' && !held.has(id))
  if (added.length === 0) return

  const records = (await teams.getMany(added)) as Team[]
  const byId = new Map(records.map((team) => [team.id, team]))

  for (const id of added) {
    const club = byId.get(id)
    // An id naming no club leaks nothing and is refused by the routes that
    // would act on it. Answering for it here would be a second opinion.
    if (!club || club.organizerId === organizerId) continue

    const entry = tournamentId ? await getEntry(tournamentId, id) : null
    if (entry?.status !== 'accepted') {
      throw forbidden(`${club.name} has not agreed to play in this competition`)
    }
  }
}

export function toVisitingTeam(team: Team): Team {
  const out: Record<string, unknown> = { visiting: true }
  for (const field of VISITING_TEAM_FIELDS) {
    if (team[field] !== undefined) out[field] = team[field]
  }

  // A hole in the list. These come from the browser-side era and from a
  // tournament POST that passes its body through, and a null here is a null
  // every screen that draws a squad would then dereference.
  const players = Array.isArray(team.players)
    ? (team.players as Array<Record<string, unknown> | null>)
        .filter(
          (player): player is Record<string, unknown> =>
            Boolean(player) && typeof player === 'object',
        )
        .map((player) => {
          const kept: Record<string, unknown> = {}
          for (const field of VISITING_PLAYER_FIELDS) {
            if (player[field] !== undefined) kept[field] = player[field]
          }
          return kept
        })
    : []

  out.players = players
  return out as Team
}

export function registerAdminRoutes(router: Router<RequestContext>): void {
  /* ---------------- listings (include private data) ---------------- */

  router.get('/admin/organizers', async (ctx) => {
    const user = await ctx.user()
    const all = await organizers.list(adminRead)
    return isSuperAdmin(user) ? all : all.filter((o) => o.id === user.organizerId)
  })

  /**
   * The clubs this account administers, plus the ones visiting its
   * competitions.
   *
   * A club belonging to another organiser can be playing here — it applied and
   * was accepted, or it was invited — and until this route said so it was a row
   * of teamIds with no record behind it: every one of the organiser's screens
   * reads its clubs from this one list, so a visiting club had no name in the
   * table, no name in the fixture list, and no squad to pick a teamsheet from.
   * The organiser's own screens are what needs it; `toVisitingTeam` decides
   * what of somebody else's club they are shown.
   *
   * A team manager belongs to no organizer, and DynamoDB rejects an empty key
   * value — so asking anyway turned their first admin request into a 500
   * instead of the empty list it means.
   */
  router.get('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return teams.listAll(adminRead)
    if (!user.organizerId) return []

    const own = await teams.listByOrganizer(user.organizerId, adminRead)
    const mine = new Set(own.map((team) => team.id))

    const seasons = await tournaments.listByOrganizer(user.organizerId, adminRead)
    // Which of this organiser's seasons each foreign club appears in, so its
    // agreement can be looked up against one of them.
    const visitors = new Map<string, string[]>()
    for (const season of seasons) {
      for (const id of (season.teamIds ?? []) as string[]) {
        if (mine.has(id)) continue
        const seen = visitors.get(id)
        if (seen) seen.push(season.id)
        else visitors.set(id, [season.id])
      }
    }
    if (visitors.size === 0) return own

    // What opens another organiser's club is the club having agreed to play
    // here, not its id appearing in a list this organiser writes. `PATCH
    // /admin/tournaments/:id` still passes its body through, so `teamIds` can
    // name any club in the system; `assertEnterableTeams` refuses to add one
    // that has not agreed, and this is the same rule on the way out — it also
    // covers the seasons written before that check existed.
    //
    // One query per visiting club, on the `teamId-index`, rather than a read
    // per club-and-season pair: `visitors` collects every id in every season
    // that is not this organiser's, which includes ids naming nothing at all —
    // clubs deleted years ago, and rows from the browser-side era — and this is
    // the read every one of the organiser's screens starts with.
    const checked = await Promise.all(
      [...visitors].map(async ([teamId, seasonIds]) => {
        const seasons = new Set(seasonIds)
        const rows = await entriesForTeam(teamId)
        return rows.some((row) => row.status === 'accepted' && seasons.has(row.tournamentId))
          ? teamId
          : null
      }),
    )
    const agreed = checked.filter((id): id is string => id !== null)
    if (agreed.length === 0) return own

    const visiting = (await teams.getMany(agreed)) as Team[]
    return [...own, ...visiting.map(toVisitingTeam)]
  })

  router.get('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return tournaments.listAll(adminRead)
    return user.organizerId ? tournaments.listByOrganizer(user.organizerId, adminRead) : []
  })

  router.get('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    return tournament
  })

  /* ---------------- organizers ---------------- */

  router.post('/admin/organizers', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const name = requireString(ctx.body.name, 'name')
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    return organizers.create({ name, email })
  })

  router.patch('/admin/organizers/:id', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const existing = await organizers.get(params.id!)
    if (!existing) throw notFound('Organizer not found')
    await organizers.update(params.id!, ctx.body)
    return { ok: true }
  })

  /**
   * What deleting this organizer would take with it.
   *
   * The confirmation has to say more than "are you sure": the competitions go,
   * the clubs do not, and the logins stop working. The page asking the question
   * holds none of that, so the server counts it.
   */
  router.get('/admin/organizers/:id/impact', async (ctx, params) => {
    assertSuperAdmin(await ctx.user())
    const id = params.id!
    if (!(await organizers.get(id))) throw notFound('Organizer not found')

    // Read past the cache, exactly as the delete does. Answering this one from
    // a stale copy is worse than answering it slowly: the operator would be
    // agreeing to a smaller deletion than the one that happens.
    const [ownTournaments, ownTeams, accounts] = await Promise.all([
      tournaments.listByOrganizer(id, liveRead),
      teams.listByOrganizer(id, liveRead),
      accountsOfOrganizer(id),
    ])

    return {
      tournaments: ownTournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
      })),
      teams: ownTeams.map((team) => ({ id: team.id, name: team.name })),
      accounts: accounts.map((account) => account.email),
    }
  })

  /**
   * Deletes an organizer and everything that only makes sense alongside it.
   *
   * A competition belongs to whoever runs it and goes with them. A club does
   * not: it has its own managers, its own squad and a life longer than any one
   * league, so it is moved to another organizer named by the caller rather than
   * deleted. Deleting the organizer row alone — all this route used to do — left
   * both behind, owned by nobody and still listed on the public site, and the
   * organizer's login still worked.
   *
   * The order is deliberate and every step is idempotent: clubs are moved to
   * safety first, the organizer row goes last, and a request that fails halfway
   * can simply be repeated. There is no cross-table transaction to lean on.
   */
  router.delete('/admin/organizers/:id', async (ctx, params) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const id = params.id!
    const organizer = await organizers.get(id)
    if (!organizer) throw notFound('Organizer not found')

    // These two lists decide what gets deleted and what gets moved, so they
    // are read past the cache. The listings live in the Lambda's memory and a
    // write made by another warm container does not invalidate this copy: a
    // competition created a minute ago could be missing from it and would
    // survive as an orphan, which is the whole bug this route exists to stop.
    // The index behind them is eventually consistent, so something created in
    // the last second can still be missed; `scripts/delete-orphans.mjs` is the
    // net underneath.
    const [ownTournaments, ownTeams] = await Promise.all([
      tournaments.listByOrganizer(id, liveRead),
      teams.listByOrganizer(id, liveRead),
    ])

    const teamsTo = typeof ctx.query?.teamsTo === 'string' ? ctx.query.teamsTo.trim() : ''
    if (ownTeams.length > 0) {
      if (!teamsTo) {
        throw badRequest(
          `${ownTeams.length} ${ownTeams.length === 1 ? 'club belongs' : 'clubs belong'} to this organizer. Name the organizer to move them to.`,
        )
      }
      if (teamsTo === id) throw badRequest('Clubs cannot be moved to the organizer being deleted')
      if (!(await organizers.get(teamsTo))) {
        throw badRequest('The organizer the clubs would move to does not exist')
      }
    }

    for (const team of ownTeams) {
      // The organizer being deleted may have run this club as well as owned it,
      // and the link on the club would outlive their account. Before the move,
      // so that a failure here leaves the club unmoved and the whole request
      // repeatable, which is what every other step of this route is.
      await unlinkOwnerManagers(team as Team, id)
      await teams.update(team.id, { organizerId: teamsTo })
    }

    for (const tournament of ownTournaments) {
      await deleteEntriesForTournament(tournament.id)
      await tournaments.remove(tournament.id)
    }

    // An invitation is a door into a club, and it outlives the organizer that
    // wrote it by a fortnight unless it goes now.
    const invitesDeleted = await deleteInvitesOfOrganizer(id)

    // Every login attached to this organizer, not only the one matching its
    // contact address. The interface used to delete the account by email in a
    // second request of its own, which failed with "Account not found" whenever
    // the addresses had drifted apart — and left the account able to sign in.
    //
    // Never a super admin, and never the caller: the role has nobody above it
    // to recreate it, and an organizerId on such an account would be a mistake
    // in the data rather than a licence to delete the keys to the building.
    const accounts = (await accountsOfOrganizer(id)).filter(
      (account) => account.role !== 'super_admin' && account.id !== actor.id,
    )
    for (const account of accounts) {
      await deleteAllUserSessions(account.id)
      await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_USERS, Key: { id: account.id } }))
    }

    await organizers.remove(id)

    await record(actor, {
      action: 'organizer.delete',
      entity: 'organizer',
      entityId: id,
      // Where the clubs went belongs in here. `teamsTo` is any organizer id the
      // caller names, so a mistyped one that happens to exist hands somebody
      // else a league's worth of clubs, and this line is the only way back to
      // finding out where they are.
      summary:
        `Deleted ${organizer.name}: ${ownTournaments.length} ${ownTournaments.length === 1 ? 'competition' : 'competitions'}` +
        `, ${accounts.length} ${accounts.length === 1 ? 'login' : 'logins'}` +
        `, ${invitesDeleted} ${invitesDeleted === 1 ? 'invitation' : 'invitations'}` +
        (ownTeams.length > 0 ? `, ${ownTeams.length} clubs moved to ${teamsTo}` : ''),
      organizerId: id,
    })

    return {
      ok: true,
      tournamentsDeleted: ownTournaments.length,
      teamsMoved: ownTeams.length,
      accountsDeleted: accounts.length,
      invitesDeleted,
    }
  })

  /* ---------------- teams ---------------- */

  router.post('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    // The same whitelist the PATCH uses, rather than the body whole. It was
    // merely untidy while an organizer could edit any club they owned; now
    // that a manager's presence closes a club to them, a `managerUserIds` in
    // the create body makes a club its own creator cannot edit, and an id
    // naming no account cannot be taken off the list afterwards.
    const fields = pick(ctx.body, TEAM_FIELDS)
    assertTeamColours(fields)
    // Checked on the create as well as on the update: a validation that runs on
    // one and not the other has not been done, which is the lesson `colors`
    // taught this file.
    assertClubFlags(fields)
    const team = await teams.create({
      ...fields,
      name,
      organizerId,
      // Every screen reads this as a list. A club stored without the key is
      // one whose card throws on the way in.
      players: [],
    })
    await record(user, {
      action: 'team.create',
      entity: 'team',
      entityId: (team as { id?: string }).id ?? '',
      summary: `Created the team ${name}`,
      organizerId,
    })
    return team
  })

  router.patch('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertManagesTeam(user, team)
    // A named list rather than whatever arrived. Passing the body straight
    // through wrote any attribute a caller invented onto the club, and put its
    // key names verbatim into the audit log the super admin reads.
    //
    // Two absences are deliberate. `organizerId`: a club is not moved between
    // organizers by editing it. `managerUserIds`: who runs a club is decided by
    // invitation, and a manager able to write that field could hand the club to
    // anyone or quietly remove the others.
    const updates = pick(ctx.body, TEAM_FIELDS)
    if (isSuperAdmin(user) && typeof ctx.body.organizerId === 'string') {
      updates.organizerId = ctx.body.organizerId
    }
    if (Object.keys(updates).length === 0) throw badRequest('Nothing to change')

    assertTeamColours(updates)
    assertClubFlags(updates)

    // A club changing hands takes its manager list with it, and the previous
    // owner's own link to it was granted by owning it. Done before the move
    // rather than after: the unlink keys on the club id alone, so failing here
    // leaves the club where it was and the move can simply be repeated —
    // whereas moving first and failing second is unrepairable, because the
    // retry reads the new owner and no longer sees a move to react to. What a
    // retry cannot repair is a manager dropped from the club but not from their
    // own account; `/manager/overview` decides from the club record for that
    // reason, and the two are load-bearing for each other.
    const movingTo = typeof updates.organizerId === 'string' ? updates.organizerId : ''
    const isMove = movingTo !== '' && movingTo !== team.organizerId
    if (isMove) await unlinkOwnerManagers(team as Team, team.organizerId as string)

    await teams.update(params.id!, updates)

    if (isMove) {
      await record(user, {
        action: 'team.move',
        entity: 'team',
        entityId: params.id!,
        summary: `Moved ${team.name} to ${movingTo}; its previous organizer no longer runs it`,
        organizerId: team.organizerId,
      })
    }
    await record(user, {
      action: 'team.update',
      entity: 'team',
      entityId: params.id!,
      summary: `Edited ${team.name}: ${describeFields(updates)}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /**
   * Takes somebody off a club.
   *
   * Without this a manager, once linked, was there forever: `PATCH` refuses to
   * write `managerUserIds`, so a coach who left — or one who used a leaked
   * invitation — kept full control of the club and the only remedy was deleting
   * their whole account. This is the organizer's to do, not a manager's: the
   * managers of a club should not be able to remove each other.
   */
  /**
   * Who runs one club, for the organizer who owns it.
   *
   * Deliberately its own route rather than a field on the club: the club record
   * goes to the public projection and to the manager's own overview, and an
   * email address belongs in neither. Here the caller has already had to prove
   * they run the competition the club plays in.
   */
  router.get('/admin/teams/:id/managers', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)
    const byTeam = await managersOfTeams([team as Team])
    return byTeam[team.id] ?? []
  })

  /**
   * The same, for every club in one competition.
   *
   * The organizer's question is "which of these clubs has somebody running it",
   * and asking it a club at a time is twenty requests and twenty scans.
   */
  router.get('/admin/tournaments/:id/managers', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const list = await teams.getMany(tournament.teamIds ?? [])
    // A club another organizer owns can be playing here; its manager's address
    // is that organizer's to show, not this one's.
    const own = (list as Team[]).filter(
      (team) => isSuperAdmin(user) || team.organizerId === tournament.organizerId,
    )
    return managersOfTeams(own)
  })

  /**
   * An organizer taking their own club under management.
   *
   * Some organizers run a club as well as the competition, and the only way in
   * was to issue themselves an invitation and open the link — a one-time token
   * emailed nowhere, used to grant a permission they already had the standing
   * to grant. This is the same write without the detour.
   *
   * It is the organizer's own test, not the club's: whoever owns the club may
   * take it on, and nobody else. A club manager pressing this on somebody
   * else's club is exactly the write `PATCH` refuses to make.
   *
   * Only a club nobody runs, though. A claimed club is its manager's to edit,
   * and without this line that rule would be one click away from being undone:
   * the organizer joins the club's managers, `managesTeam` lets them in, and
   * the audit log records it as the ordinary thing an owner does. Taking the
   * club back means removing its manager first, which the manager can see.
   */
  router.post('/admin/teams/:id/managers/me', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)
    // Not the super admin, who may touch anything and is only ever kept out of
    // a club by accident.
    if (!isSuperAdmin(user) && isClaimedTeam(team as Team)) {
      throw forbidden('This club already has a manager. Remove them first to run it yourself.')
    }

    await linkManagerToTeam(user, team as Team)
    await record(user, {
      action: 'team.manager.self',
      entity: 'team',
      entityId: team.id,
      summary: `Took ${team.name} under their own management`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/teams/:id/managers/:userId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)

    await unlinkManagerFromTeam(params.userId!, team as Team)
    await record(user, {
      action: 'team.manager.remove',
      entity: 'team',
      entityId: params.id!,
      summary: `Removed a manager from ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertCanAccessOrganizer(user, team.organizerId)

    // The mirror of the tournament delete: an application or an invitation
    // naming a club that no longer exists shows on the organiser's screen as a
    // decision to make about nobody.
    await deleteEntriesForTeam(params.id!)
    await teams.remove(params.id!)

    // Whoever ran this club stops running it. The link is stored on the account
    // as well as on the club, so deleting the club alone left `teamIds` naming
    // a record that no longer exists. After the delete rather than before: a
    // delete that fails would otherwise leave a live club with no managers and
    // no way back except a fresh invitation, and a failure here is harmless —
    // the manager's own overview reads the club record, which has gone.
    for (const managerId of (team as Team).managerUserIds ?? []) {
      await unlinkManagerFromTeam(managerId, team as Team)
    }
    await record(user, {
      action: 'team.delete',
      entity: 'team',
      entityId: params.id!,
      summary: `Deleted the team ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /* ---------------- players ---------------- */

  /**
   * Players live inside their team's record, but they are edited one at a time.
   * These three routes exist so the client never has to send the whole squad
   * back to save one field.
   */
  router.post('/admin/teams/:id/players', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    const player = await teams.addPlayer(params.id!, {
      ...newPlayerFields(ctx.body),
      firstName: typeof ctx.body.firstName === 'string' ? ctx.body.firstName : '',
      lastName: typeof ctx.body.lastName === 'string' ? ctx.body.lastName : '',
      position: typeof ctx.body.position === 'string' ? ctx.body.position : '',
      number: typeof ctx.body.number === 'number' ? ctx.body.number : undefined,
      isPublic: ctx.body.isPublic !== false,
    })
    await record(user, {
      action: 'player.create',
      entity: 'team',
      entityId: params.id!,
      summary: `Added a player to ${team.name}`,
      organizerId: team.organizerId,
    })
    return player
  })

  router.patch('/admin/teams/:id/players/:playerId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    // Named fields only: the id is the anchor for the targeted write and
    // never a field to change, and the record is schemaless, so anything not
    // on the list would be persisted onto the player by whoever asked.
    const updates = playerUpdates(ctx.body)
    // A write that changes nothing still rewrites the element from the copy
    // read at the start of this request, which is how a save made a moment ago
    // by somebody else disappears.
    if (Object.keys(updates).length === 0) throw badRequest('Nothing to change')

    const player = await teams.updatePlayer(params.id!, params.playerId!, updates)
    await record(user, {
      action: 'player.update',
      entity: 'team',
      entityId: params.id!,
      summary: `Edited a player of ${team.name}: ${describeFields(updates)}`,
      organizerId: team.organizerId,
    })
    return player
  })

  router.delete('/admin/teams/:id/players/:playerId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    await teams.removePlayer(params.id!, params.playerId!)
    await record(user, {
      action: 'player.delete',
      entity: 'team',
      entityId: params.id!,
      summary: `Removed a player from ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /* ---------------- tournaments ---------------- */

  router.post('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    // The create passes the body through, exactly as the PATCH below does, so
    // the colour check has to run here too — otherwise a competition created
    // with `themeColor: "url(…)"` keeps it, since a later PATCH only checks
    // the fields it is given.
    assertCompetitionColours(ctx.body)
    // Nothing has agreed to anything yet, so a club this organiser does not own
    // cannot be in a competition on the day it is created.
    await assertEnterableTeams(organizerId, null, ctx.body.teamIds, [])
    const tournament = await tournaments.create({ ...ctx.body, name, organizerId })
    await record(user, {
      action: 'tournament.create',
      entity: 'tournament',
      entityId: (tournament as { id?: string }).id ?? '',
      summary: `Created ${name}`,
      organizerId,
    })
    return tournament
  })

  /**
   * Everything else about a competition, from the screen that edits it.
   *
   * This one passes the body through rather than picking from a named list,
   * which the rest of the API does not do. Two fields are held back from it by
   * name, because each has a route of its own that does something a plain write
   * cannot:
   *
   * - `squads` is one map shared by every club in the competition, and writing
   *   it whole is how two clubs saving in the same minute erase each other.
   *   `setSquad` writes one key inside it.
   * - `squadsStrict` changes what an absent entry means, from everybody to
   *   nobody. Set here it would empty every teamsheet picker in a season
   *   already being played; `squad-mode` enters the clubs first.
   *
   * The rest of the record staying open is a debt, not a decision — a field
   * added to a tournament for the organiser is writable here the day it exists.
   */
  const TOURNAMENT_PATCH_FORBIDDEN = ['squads', 'squadsStrict']

  router.patch('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const refused = TOURNAMENT_PATCH_FORBIDDEN.filter((field) => field in ctx.body)
    if (refused.length > 0) {
      throw badRequest(`${refused.join(' and ')} cannot be edited here`)
    }

    // This body is still passed through rather than picked from a named list —
    // the debt described above — so the colours have to be named here.
    assertCompetitionColours(ctx.body)
    await assertEnterableTeams(
      tournament.organizerId,
      params.id!,
      ctx.body.teamIds,
      (tournament.teamIds ?? []) as string[],
    )

    await tournaments.update(params.id!, ctx.body)
    await record(user, {
      action: 'tournament.update',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Edited ${tournament.name}: ${describeFields(ctx.body)}`,
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    // Before the removal, and the same call the organizer delete makes: an
    // entry is keyed by its tournament, so a row left behind is an invitation
    // the club can see on its own page and can neither accept nor dismiss.
    await deleteEntriesForTournament(params.id!)
    await tournaments.remove(params.id!)
    await record(user, {
      action: 'tournament.delete',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Deleted ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })


  /**
   * The playoff rounds an organiser builds by hand: added, renamed, resized and
   * deleted one at a time.
   *
   * Their own routes rather than a `format` sent to the tournament PATCH, which
   * is what the screen used to do. That PATCH replaces the whole attribute from
   * the copy the browser is holding, and these rounds hold fixtures, which hold
   * the goals and the cards the organiser enters and the teamsheets a club's
   * own manager writes. Renaming a round would have undone all of it — the same
   * failure the match PATCH exists to prevent, one level deeper.
   */
  router.post('/admin/tournaments/:id/playoff-rounds', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const fixtures = Array.isArray(ctx.body.matches) ? ctx.body.matches : []
    if (fixtures.length > 20) throw badRequest('A round holds at most 20 games')

    const round = await tournaments.addPlayoffRound(params.id!, {
      name: typeof ctx.body.name === 'string' ? ctx.body.name : 'Playoff round',
      description: typeof ctx.body.description === 'string' ? ctx.body.description : '',
      // Picked field by field like every other body: these records are
      // schemaless, so anything not named here would be persisted onto a
      // fixture by whoever asked for it. A non-object entry is dropped rather
      // than picked, because `pick` on a null is a 500.
      matches: fixtures
        .filter((one) => one && typeof one === 'object')
        .map((one) => {
          const fixture = pick(one as Record<string, unknown>, MATCH_FIELDS)
          assertClubsAreInTournament(fixture, tournament)
          return fixture
        }),
    })

    await record(user, {
      action: 'playoffRound.add',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Added ${round.name} to ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return round
  })

  router.patch('/admin/tournaments/:id/playoff-rounds/:index', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const index = Number(params.index)
    if (!Number.isInteger(index) || index < 0) throw badRequest('That is not a round')

    const updates: { name?: string; description?: string; quantityOfGames?: number } = {}
    if (typeof ctx.body.name === 'string') updates.name = ctx.body.name
    if (typeof ctx.body.description === 'string') updates.description = ctx.body.description
    if (typeof ctx.body.quantityOfGames === 'number') {
      updates.quantityOfGames = ctx.body.quantityOfGames
    }

    const round = await tournaments.updatePlayoffRound(
      params.id!,
      index,
      updates,
      expectedRound(ctx.body),
    )

    await record(user, {
      action: 'playoffRound.update',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Edited ${round.name} in ${tournament.name}: ${describeFields(updates)}`,
      organizerId: tournament.organizerId,
    })
    return round
  })

  router.delete('/admin/tournaments/:id/playoff-rounds/:index', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const index = Number(params.index)
    if (!Number.isInteger(index) || index < 0) throw badRequest('That is not a round')

    // From the query string: a DELETE carries no body, and the round the person
    // clicked has to be named or the index alone decides which one goes.
    await tournaments.removePlayoffRound(params.id!, index, expectedRound(ctx.query))

    await record(user, {
      action: 'playoffRound.delete',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Deleted a playoff round from ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  router.patch('/admin/tournaments/:tournamentId/matches/:matchId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const updates = pick(ctx.body, MATCH_FIELDS)
    if (Object.keys(updates).length === 0) throw badRequest('Nothing to change')
    assertClubsAreInTournament(updates, tournament)

    await tournaments.updateMatch(params.tournamentId!, params.matchId!, updates)
    await record(user, {
      action: 'match.update',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: describeMatchEdit(updates, tournament.name),
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  /**
   * The organiser's teamsheet, for either club in one of their matches.
   *
   * Its own route rather than a `lineups` field on the match PATCH, because
   * that PATCH writes both halves of the fixture from whatever the browser is
   * holding — and since a club's manager now writes their own half, a stale
   * copy of the other one would silently undo them. One side at a time is what
   * makes the two authors safe to have at once.
   */
  router.put('/admin/tournaments/:tournamentId/matches/:matchId/lineup', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const teamId = requireString(ctx.body.teamId, 'teamId')
    // Either home of a fixture: a hand-built playoff round keeps its matches
    // inside the format rather than in `matches`, and a teamsheet is filled in
    // for one of those exactly as it is for a league game.
    const match = locateMatch(tournament, params.matchId!)?.match
    if (!match) throw notFound('Match not found in this tournament')

    const side = sideOfTeam(match, teamId)
    if (!side) throw badRequest('That club is not playing in this match')

    const team = await teams.getOrThrow(teamId)
    const allowed = nameableInMatch(tournament, team as Team, match, side)
    const refused = refusedByRegistration(
      ctx.body.playerIds,
      allowed,
      squadPlayerIds(team as Team),
    )
    if (refused.length > 0) {
      throw badRequest(
        `${refused.length === 1 ? 'A player' : 'Some players'} in this teamsheet are not registered for this competition. Reload the page and try again.`,
      )
    }

    const playerIds = pickLineup(ctx.body.playerIds, allowed)
    await tournaments.setLineup(params.tournamentId!, params.matchId!, teamId, side, playerIds)

    await record(user, {
      action: 'lineup.update',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: `Named ${playerIds.length} players for ${team.name} in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { playerIds }
  })

  /**
   * The organiser entering one club in their competition.
   *
   * The club's manager has the same write in `clubs.ts`, and for the same
   * reason as the teamsheet: most clubs have no manager, and the ones that do
   * have one who can go quiet a week before the deadline. A competition whose
   * entries only a coach can fill in is a competition an organiser cannot run.
   *
   * `squadsLocked` is not consulted here. It is the deadline the organiser
   * themselves set for the managers; somebody has to be able to fix a mistake
   * after it, and that somebody is the person who set it.
   */
  router.put('/admin/tournaments/:tournamentId/squads/:teamId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const teamId = params.teamId!
    if (!(tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is not in that competition')
    }

    // The club is read for its squad, not for permission: what the organiser
    // may write was settled by the competition they run, and a club playing in
    // it is theirs to enter whoever owns the club record.
    const team = await teams.getOrThrow(teamId)
    const known = squadPlayerIds(team as Team)
    const { playerIds, store, all } = chooseSquad(ctx.body.playerIds, known, isStrict(tournament))

    await tournaments.setSquad(params.tournamentId!, teamId, store)

    await record(user, {
      action: 'squad.update',
      entity: 'tournament',
      entityId: params.tournamentId!,
      summary: all
        ? `Entered the whole squad of ${team.name} in ${tournament.name}`
        : `Entered ${playerIds.length} of ${known.size} players of ${team.name} in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { playerIds, all }
  })

  /**
   * Turning strict entry on and off.
   *
   * Its own route rather than a field of the tournament PATCH, because turning
   * it on is not only a flag: under the strict rule a club with no entry has
   * nobody registered, so flipping it on a season already being played would
   * empty every teamsheet picker in the competition at once. Every club that
   * has not been entered is therefore entered as it stands first, which makes
   * the change mean "from here on the list is fixed" rather than "everybody
   * out". Only then is the flag written.
   *
   * It is done twice, and the second pass is not belt and braces. A manager
   * ticking their whole squad in an open competition is stored as no entry at
   * all — the two mean the same thing there — so one landing between the first
   * pass and the flag would leave that club entered by nobody under a rule that
   * reads absence as nobody: the manager who pressed "everyone" would have
   * registered no one. Once the flag is written that save cannot happen again,
   * because every squad write reads the competition afresh and a strict one
   * stores the list itself. So the second pass runs after the flag and picks up
   * whatever landed in the gap.
   *
   * Turning it off leaves those entries alone. They are what the clubs actually
   * registered, and the open rule reads them the same way; it only changes what
   * an absent one means.
   */
  router.put('/admin/tournaments/:tournamentId/squad-mode', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const strict = ctx.body.strict === true
    let entered = 0

    /**
     * Enters every club of this competition that has no entry, as it stands.
     *
     * Reads the competition again rather than trusting the copy the handler
     * opened with, and each write is conditional on the club still having no
     * entry, so a manager who saved a squad in the meantime keeps it. Both
     * matter: the list of who is missing is a snapshot the moment it is taken.
     */
    const enterEveryoneMissing = async (): Promise<void> => {
      const current = await tournaments.getOrThrow(params.tournamentId!)
      const existing =
        current.squads && typeof current.squads === 'object'
          ? (current.squads as Record<string, unknown>)
          : {}
      const missing = (current.teamIds ?? []).filter((id) => !Array.isArray(existing[id]))
      if (missing.length === 0) return

      await tournaments.ensureSquads(params.tournamentId!)
      for (const team of await teams.getMany(missing)) {
        const wrote = await tournaments.enterSquadIfAbsent(params.tournamentId!, team.id, [
          ...squadPlayerIds(team as Team),
        ])
        if (wrote) entered += 1
      }
    }

    if (strict && !isStrict(tournament)) await enterEveryoneMissing()

    await tournaments.update(params.tournamentId!, { squadsStrict: strict })

    if (strict && !isStrict(tournament)) await enterEveryoneMissing()

    await record(user, {
      action: 'tournament.update',
      entity: 'tournament',
      entityId: params.tournamentId!,
      summary: strict
        ? `Made squads strict in ${tournament.name}${entered > 0 ? `, entering ${entered} clubs as they stand` : ''}`
        : `Made squads open in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { strict, entered }
  })

  /* ---------------- accounts (super admin only) ---------------- */

  /**
   * Creates the login for an organizer.
   *
   * The caller must supply a real password. The old version defaulted every new
   * account — and the super admin itself — to "123".
   */
  router.post('/admin/accounts', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    const password = ctx.body.password
    const displayName =
      typeof ctx.body.displayName === 'string' ? ctx.body.displayName.trim() : undefined
    // A second super admin is not a luxury: the role has nobody above it to
    // reset its password, so one account means one lost password from disaster.
    const role: AuthUser['role'] = ctx.body.role === 'super_admin' ? 'super_admin' : 'organizer'
    const organizerId =
      role === 'super_admin'
        ? undefined
        : requireString(ctx.body.organizerId, 'organizerId')

    try {
      assertPasswordStrength(password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    if (await findUserByCredential(email)) {
      throw badRequest('An account with this email already exists')
    }

    const salt = generateSalt()
    const user: AuthUser = {
      id: generateId(),
      email,
      displayName,
      role,
      organizerId,
      passwordHash: await hashPassword(password as string, salt),
      salt,
      createdAt: new Date().toISOString(),
      isActive: true,
    }

    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    await record(await ctx.user(), {
      action: 'account.create',
      entity: 'account',
      entityId: email,
      summary: `Created a ${role.replace('_', ' ')} account`,
      organizerId,
    })
    return toPublicUser(user)
  })

  /**
   * A reset link the super admin can pass on by hand.
   *
   * Until email is out of the SES sandbox this is how anyone but the owner of a
   * verified address gets back in — and it stays useful afterwards, for the
   * person who cannot find the message.
   */
  router.post('/admin/accounts/reset-link', async (ctx) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const email = requireString(ctx.body.email, 'email').toLowerCase()

    const target = await findUserByCredential(email)
    if (!target) throw notFound('Account not found')

    const reset = await issueResetToken(target, 'admin')
    const link = `${SITE_URL}/reset-password?token=${reset.token}`
    const mail = ctx.body.send === true ? await sendPasswordReset(email, link) : { sent: false }

    await record(actor, {
      action: 'account.reset_link',
      entity: 'account',
      entityId: email,
      summary: mail.sent ? 'Sent a reset link by email' : 'Issued a reset link',
      organizerId: target.organizerId,
    })

    return { link, expiresAt: reset.expiresAt, emailed: mail.sent }
  })

  /** The record of who changed what. */
  router.get('/admin/audit', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const limit = Number(ctx.query?.limit ?? 100)
    return recent(Number.isFinite(limit) ? limit : 100)
  })

  router.post('/admin/accounts/reset-password', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    const password = ctx.body.password

    try {
      assertPasswordStrength(password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const target = await findUserByCredential(email)
    if (!target) throw notFound('Account not found')

    const salt = generateSalt()
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: target.id },
        UpdateExpression: 'SET passwordHash = :hash, salt = :salt',
        ExpressionAttributeValues: {
          ':hash': await hashPassword(password as string, salt),
          ':salt': salt,
        },
      }),
    )
    await deleteAllUserSessions(target.id)
    await record(await ctx.user(), {
      action: 'account.set_password',
      entity: 'account',
      entityId: email,
      summary: 'Set a new password directly',
      organizerId: target.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/accounts/:email', async (ctx, params) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const target = await findUserByCredential(params.email!.toLowerCase())
    if (!target) throw notFound('Account not found')

    await deleteAllUserSessions(target.id)
    // Whoever this account ran clubs for stops running them. The id is what
    // makes a club claimed, and a claimed club is closed to its organizer, so
    // an account deleted while still linked left a club nobody at all could
    // edit — its manager cannot sign in and its organizer is refused. Before
    // the delete rather than after: a failure here leaves an account to be
    // deleted again, which is recoverable, instead of that club.
    for (const teamId of target.teamIds ?? []) {
      const team = await teams.get(teamId)
      if (team) await unlinkManagerFromTeam(target.id, team as Team)
    }
    await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_USERS, Key: { id: target.id } }))
    await record(actor, {
      action: 'account.delete',
      entity: 'account',
      entityId: params.email!.toLowerCase(),
      summary: 'Deleted the account',
      organizerId: target.organizerId,
    })
    return { ok: true }
  })
}

/** "name, visibility" — enough to know what was touched, without storing it. */
/**
 * Which round the caller believed they were editing.
 *
 * An index into a list the browser read earlier is not an identity: a round
 * deleted in another tab shifts every round after it up by one. Both the number
 * and the name are carried so that a round from before `roundNumber` existed
 * can still be named. Query values arrive as strings, hence the parse.
 */
function expectedRound(source: Record<string, unknown>): {
  roundNumber?: number
  name?: string
} {
  // `expected…`, not `name` and `roundNumber`: the PATCH body carries those as
  // the new values, and the two must not be the same field.
  const raw = source.expectedRoundNumber
  const roundNumber = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return {
    roundNumber: Number.isFinite(roundNumber) ? roundNumber : undefined,
    name: typeof source.expectedName === 'string' ? source.expectedName : undefined,
  }
}

/**
 * A fixture may only name clubs this competition is holding.
 *
 * Without it an organiser could seed a playoff tie with any club id at all,
 * including one another organiser runs — and that club's manager would then be
 * entitled to write a teamsheet into a competition they have nothing to do
 * with. An empty side is a tie whose clubs are not decided yet, and `BYE` is
 * how a bracket says nobody.
 */
function assertClubsAreInTournament(
  fixture: Record<string, unknown>,
  tournament: { teamIds?: unknown },
): void {
  const entered = new Set(Array.isArray(tournament.teamIds) ? tournament.teamIds : [])
  for (const side of ['homeTeamId', 'awayTeamId'] as const) {
    const teamId = fixture[side]
    if (teamId === undefined || teamId === null || teamId === '' || teamId === 'BYE') continue
    if (!entered.has(teamId)) throw badRequest('That club is not in this competition')
  }
}

function describeFields(updates: Record<string, unknown>): string {
  const fields = Object.keys(updates).filter((key) => key !== 'id')
  if (fields.length === 0) return 'nothing'
  return fields.slice(0, 6).join(', ') + (fields.length > 6 ? ` and ${fields.length - 6} more` : '')
}

/** A score change is the one edit people come back to argue about. */
function describeMatchEdit(updates: Record<string, unknown>, tournamentName: string): string {
  const home = updates.homeGoals
  const away = updates.awayGoals
  if (typeof home === 'number' || typeof away === 'number') {
    return `Set the score to ${home ?? '-'}:${away ?? '-'} in ${tournamentName}`
  }
  return `Edited a match of ${tournamentName}: ${describeFields(updates)}`
}
