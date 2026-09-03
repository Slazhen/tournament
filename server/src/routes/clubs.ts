import { badRequest, forbidden, notFound } from '../lib/http.js'
import {
  assertCanAccessOrganizer,
  assertIsOrganizer,
  assertManagesTeam,
  isClaimedTeam,
  isSuperAdmin,
  managesTeam,
} from '../lib/auth.js'
import { assertPasswordStrength, generateId, generateSalt, hashPassword } from '../lib/passwords.js'
import { createSession } from '../lib/sessions.js'
import { ddb, PutCommand, scanAll } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { record } from '../lib/audit.js'
import { adminRead } from '../lib/cache.js'
import { sendTeamInvite } from '../lib/mail.js'
import { teams, tournaments, organizers, isPublic, seasonStatus } from '../repos.js'
import {
  consumeInvite,
  createInvite,
  decideEntry,
  entriesForTeam,
  entriesForTournament,
  getEntry,
  linkManagerToTeam,
  peekInvite,
  putEntry,
  type Entry,
  type EntryStatus,
  type TeamInvite,
} from '../repos-clubs.js'
import {
  nameableInMatch,
  pickLineup,
  refusedByRegistration,
  sideOfTeam,
} from '../lib/lineups.js'
import { locateMatch } from '../lib/matches.js'
import { chooseSquad, isStrict, squadPlayerIds } from '../lib/squads.js'
import { toPublicUser, type AuthUser, type Team, type Tournament } from '../lib/types.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

/**
 * Clubs run by the people who play in them.
 *
 * Until now every club belonged to the organizer who typed it in, and a coach
 * had no way to touch their own squad. The way in is an invitation: the
 * organizer creates a one-time link for a club and passes it on — no email
 * addresses to collect in advance, and no stranger able to claim a club by
 * guessing its name.
 */
/**
 * A match as somebody else's club may see it.
 *
 * The date, the sides and the score: enough to work out the table the club is
 * standing in, and nothing of what happened in a match the club did not play —
 * the scorers, the cards, the statistics, the referee, the notes.
 *
 * A named list rather than a deletion of the fields that are sensitive today.
 * The records are schemaless and `PATCH /admin/tournaments/:id` writes what it
 * is given, so a field nobody has invented yet would otherwise be visible the
 * day it is written.
 */
const CARRIED_MATCH_FIELDS = [
  'id',
  // A playoff bracket names its fixture `matchId` and records a `winner`.
  'matchId',
  'winner',
  'homeTeamId',
  'awayTeamId',
  'dateISO',
  'time',
  'homeGoals',
  'awayGoals',
  'round',
  'isPlayoff',
  'playoffRound',
  'playoffMatch',
  'isElimination',
  'division',
  'groupIndex',
  'status',
]

/**
 * The competition itself, by the same rule and for the same reason.
 *
 * Everything here is either public on the competition's own page or needed to
 * draw the club's season: the format decides how the table is worked out, the
 * season fields name it, `squads` is filtered below.
 */
const CARRIED_TOURNAMENT_FIELDS = [
  'id',
  'name',
  'organizerId',
  'createdAtISO',
  'teamIds',
  'seriesId',
  'seriesName',
  'seasonLabel',
  'championTeamId',
  'logo',
  'backgroundImage',
  'location',
  'socialMedia',
  'visibility',
  'squadsLocked',
  // Without this a club playing in a strict competition would be shown its
  // squad screen under the ordinary rules, and told everybody was registered
  // when in fact nobody was.
  'squadsStrict',
]

/**
 * A playoff round, and a bracket, by the same rule as everything else here.
 *
 * These are the objects an organiser edits by hand, so they are the likeliest
 * to grow a field meant for them and not for the clubs.
 */
const CARRIED_ROUND_FIELDS = [
  'id',
  'roundNumber',
  'round',
  'name',
  'description',
  'quantityOfGames',
  'isElimination',
  'byeTeam',
]

function summariseMatch(match: unknown): unknown {
  // A hole in the list. Two other readers of this array defend against one, so
  // they happen, and one of them would otherwise fail every manager's overview.
  if (!match || typeof match !== 'object') return match

  const source = match as Record<string, unknown>
  const summary: Record<string, unknown> = {}
  for (const field of CARRIED_MATCH_FIELDS) {
    if (source[field] !== undefined) summary[field] = source[field]
  }
  return summary
}

function isOwnMatch(match: unknown, mine: Set<string>): boolean {
  if (!match || typeof match !== 'object') return false
  const { homeTeamId, awayTeamId } = match as { homeTeamId?: string; awayTeamId?: string }
  return mine.has(homeTeamId as string) || mine.has(awayTeamId as string)
}

function summariseRound(round: unknown, mine: Set<string>): unknown {
  if (!round || typeof round !== 'object') return round

  const source = round as Record<string, unknown>
  const summary: Record<string, unknown> = { matches: projectMatches(source.matches, mine) }
  for (const field of CARRIED_ROUND_FIELDS) {
    if (source[field] !== undefined) summary[field] = source[field]
  }
  return summary
}

const projectMatches = (list: unknown, mine: Set<string>): unknown[] =>
  (Array.isArray(list) ? list : []).map((match) =>
    isOwnMatch(match, mine) ? match : summariseMatch(match),
  )

/**
 * A competition as a club playing in it may see it.
 *
 * The club's own matches in full, because that is the club's own record of its
 * season; everybody else's reduced to the score. Squads are cut down to the
 * clubs the caller runs, since who a rival has registered is that club's
 * business.
 *
 * Applied only to competitions the caller does not organize: their own they
 * already hold every field of through /admin, and an organizer who also runs a
 * club should not lose sight of their own competition by taking one on.
 */
export function toClubTournament(
  tournament: Record<string, any>,
  myTeamIds: string[],
): Record<string, any> {
  const mine = new Set(myTeamIds)

  const visible: Record<string, any> = {}
  for (const field of CARRIED_TOURNAMENT_FIELDS) {
    if (tournament[field] !== undefined) visible[field] = tournament[field]
  }

  visible.matches = projectMatches(tournament.matches, mine)

  // Playoff fixtures of a hand-built format are not in `matches` at all: they
  // live inside the format, and the client concatenates the two to get the
  // season. Projecting only `matches` handed a visiting club the whole bracket.
  const format = tournament.format as Record<string, any> | undefined
  if (format) {
    const config = format.customPlayoffConfig as Record<string, any> | undefined
    visible.format = config
      ? {
          ...format,
          // The spread carries `preset` with it. Rebuilding this object without
          // it silently turns a progressive-elimination season into a generic
          // one, which is the trap CLAUDE.md names.
          customPlayoffConfig: {
            ...config,
            playoffRounds: Array.isArray(config.playoffRounds)
              ? config.playoffRounds.map((round: Record<string, any>) =>
                  summariseRound(round, mine),
                )
              : config.playoffRounds,
          },
        }
      : format
  }

  if (Array.isArray(tournament.playoffBrackets)) {
    visible.playoffBrackets = tournament.playoffBrackets.map((bracket: Record<string, any>) =>
      summariseRound(bracket, mine),
    )
  }

  if (tournament.squads && typeof tournament.squads === 'object') {
    visible.squads = Object.fromEntries(
      Object.entries(tournament.squads as Record<string, string[]>).filter(([teamId]) =>
        mine.has(teamId),
      ),
    )
  }

  return visible
}

/**
 * A club as a stranger's search shows it.
 *
 * A whitelist, like every other projection in this file, and a short one: a
 * crest, a name, how many players it has, and who to ask. These records are
 * schemaless and a `PATCH` writes what it is given, so a field invented next
 * year must not travel to other organisers by default.
 *
 * The name is a person where there is one — the manager who runs the club and
 * who ticked the box — and the league that owns the record where there is not,
 * because an unclaimed club that lists itself is its organiser saying so. An
 * email address is in neither case: an organiser who wants this club invites it
 * here, and the club decides whether to answer.
 */
export type DirectoryClub = {
  id: string
  name: string
  logo?: string
  colors: string[]
  crestColor?: string | null
  crestOpaqueBackground?: boolean | null
  squadSize: number
  ownerName?: string
  ownerKind: 'manager' | 'organizer'
}

export function toDirectoryClub(
  team: Team,
  managerNames: Map<string, string>,
  organizerNames: Map<string, string>,
): DirectoryClub {
  const named = (team.managerUserIds ?? [])
    .map((id) => managerNames.get(id))
    .filter((name): name is string => Boolean(name))

  const players = Array.isArray(team.players)
    ? (team.players as unknown[]).filter(Boolean)
    : []

  // A club with managers is run by them whatever their accounts are called, so
  // a manager who never set a display name must not make the club read as one
  // the league itself listed — that is the line the organiser decides on.
  const claimed = (team.managerUserIds ?? []).length > 0

  return {
    id: team.id,
    name: team.name,
    logo: typeof team.logo === 'string' ? team.logo : undefined,
    colors: Array.isArray(team.colors) ? (team.colors as string[]) : [],
    crestColor: (team.crestColor as string | null | undefined) ?? undefined,
    crestOpaqueBackground: (team.crestOpaqueBackground as boolean | null | undefined) ?? undefined,
    squadSize: players.length,
    ownerName: named.length > 0 ? named.join(', ') : claimed ? undefined : organizerNames.get(team.organizerId),
    ownerKind: claimed ? 'manager' : 'organizer',
  }
}

/**
 * Whether an organiser may write this answer onto an entry in this state.
 *
 * Accepting is the club's word and not the organiser's. An invitation the club
 * has not answered must not become a place in the competition at the hands of
 * the person who issued it — otherwise asking is a formality and "the club
 * agreed" means nothing. Withdrawing what they offered is theirs to do, and
 * that is what turning down an `invited` row is.
 */
export function organiserMayDecide(
  current: EntryStatus,
  next: 'accepted' | 'declined',
): boolean {
  // A club is waiting on them, or they turned its application down: that
  // answer was theirs and is theirs to reverse.
  if (current === 'pending' || current === 'declined') return true

  // Their own offer, or a club already in. They may take either back; they may
  // never grant it, because the yes is the club's to say.
  if (current === 'invited' || current === 'accepted') return next === 'declined'

  // `refused` and `withdrawn` are ends, and this is a whitelist rather than a
  // fallthrough because the first version of it was not: refusing `accepted` on
  // a `refused` row while leaving `refused -> declined` open meant the organiser
  // could launder a club's refusal into their own decision in one extra request
  // and then accept it. To ask again they issue another invitation, and the
  // club answers again.
  return false
}

export function registerClubRoutes(router: Router<RequestContext>): void {
  /* ---------------- invitations ---------------- */

  router.post('/admin/teams/:id/invites', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    // Deliberately the organizer's test rather than the club's. An invitation
    // hands somebody permanent control of a club, so a manager who already has
    // it must not be able to pass it on — nor to send mail from the product's
    // own address to an address of their choosing.
    assertCanAccessOrganizer(user, team.organizerId)

    // An invitation may also enter the club in one competition. That is a write
    // against the competition, so the same check is made against its organizer
    // rather than assumed from the club's: the two are the same organizer in
    // every case the interface offers, and the day they are not, this is the
    // difference between a link and a way into somebody else's league.
    const tournamentId =
      typeof ctx.body.tournamentId === 'string' ? ctx.body.tournamentId.trim() : ''
    const tournament = tournamentId ? await tournaments.getOrThrow(tournamentId) : null
    if (tournament) assertCanAccessOrganizer(user, tournament.organizerId)

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    const invite = await createInvite(team as Team, user.id, {
      email: email || undefined,
      tournament: tournament ? { id: tournament.id, name: tournament.name } : undefined,
    })
    const link = `${SITE_URL}/join?token=${invite.token}`

    const mail = email
      ? await sendTeamInvite(email, team.name, link, tournament?.name)
      : { sent: false }

    const where = tournament ? ` and enter it in ${tournament.name}` : ''
    await record(user, {
      action: 'team.invite',
      entity: 'team',
      entityId: team.id,
      summary: mail.sent
        ? `Emailed an invitation to run ${team.name}${where}`
        : `Created an invitation link to run ${team.name}${where}`,
      organizerId: team.organizerId,
    })

    return {
      link,
      expiresAt: invite.expiresAt,
      emailed: mail.sent,
      tournamentName: tournament?.name,
    }
  })

  /**
   * What an invitation is for, before anyone signs up for it.
   *
   * Only the club and the organizer's names: enough for the person holding the
   * link to see they are claiming the right club, and nothing that would make
   * a stolen link worth more than it already is.
   */
  router.get('/public/invites/:token', async (_ctx, params) => {
    const invite = await peekInvite(params.token!)
    if (!invite) throw notFound('This invitation has expired or has already been used')

    const organizer = await organizers.get(invite.organizerId)
    return {
      teamName: invite.teamName,
      organizerName: organizer?.name ?? '',
      // Only the name. The id would tell an unauthenticated holder of a stolen
      // link which competition to go looking at, and buys the person who was
      // actually invited nothing the name does not.
      tournamentName: invite.tournamentName ?? '',
      expiresAt: invite.expiresAt,
    }
  })

  /**
   * Taking up an invitation.
   *
   * Signed in, it attaches the club to the account that is already here. Signed
   * out, it creates the account first — the person following the link is a
   * coach with a phone, not somebody who wants to register first and read the
   * link second.
   */
  router.post('/auth/claim', async (ctx) => {
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : ''
    // Read it, check everything, and only then spend it. Consuming first meant
    // a stale session token, a weak password or an email already in use burned
    // the invitation permanently — and the organizer had to issue another.
    const invite = await peekInvite(token)
    if (!invite) throw badRequest('This invitation has expired or has already been used')

    const team = await teams.get(invite.teamId)
    if (!team) throw notFound('That club no longer exists')

    // Already signed in: just add the club.
    const authorization = ctx.headers['authorization']
    if (authorization) {
      const user = await ctx.user()
      // An invitation is not a way back into a club somebody already runs. The
      // organizer who owns the club is the one who issues these links, so
      // without this they could write one to themselves, open it, and become a
      // manager of a club that is no longer theirs to edit — the same write
      // `POST /admin/teams/:id/managers/me` refuses, three clicks further
      // round. Taking a club back means removing its manager first, where the
      // manager can see it happen. Refused before the token is spent, so a
      // link meant for a coach is still there for them.
      if (
        isClaimedTeam(team as Team) &&
        user.organizerId &&
        user.organizerId === team.organizerId
      ) {
        throw forbidden('This club already has a manager. Remove them first to run it yourself.')
      }
      if (!(await consumeInvite(token))) {
        throw badRequest('This invitation has expired or has already been used')
      }
      await linkManagerToTeam(user, team as Team)
      await record(user, {
        action: 'team.claim',
        entity: 'team',
        entityId: team.id,
        summary: `Took over running ${team.name}`,
        organizerId: team.organizerId,
      })
      await enterInvitedTournament(user, team as Team, invite)
      return { user: toPublicUser(user), teamId: team.id }
    }

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    if (!email.includes('@')) throw badRequest('A valid email address is required')

    // An invitation sent to somebody is for them. Without this, holding any
    // link — including one for your own club — was a way to open an account on
    // any address at all, and account creation is otherwise super-admin only.
    if (invite.email && invite.email !== email) {
      throw badRequest('This invitation was sent to a different email address')
    }

    try {
      assertPasswordStrength(ctx.body.password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const existing = await findActiveUserByEmail(email)
    if (existing) {
      throw badRequest('There is already an account with this email — sign in first, then open the link again')
    }

    if (!(await consumeInvite(token))) {
      throw badRequest('This invitation has expired or has already been used')
    }

    const salt = generateSalt()
    const user: AuthUser = {
      id: generateId(),
      email,
      displayName:
        typeof ctx.body.displayName === 'string' && ctx.body.displayName.trim()
          ? ctx.body.displayName.trim()
          : undefined,
      role: 'team_manager',
      passwordHash: await hashPassword(ctx.body.password as string, salt),
      salt,
      teamIds: [],
      createdAt: new Date().toISOString(),
      isActive: true,
    }

    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    await linkManagerToTeam(user, team as Team)
    await record(user, {
      action: 'team.claim',
      entity: 'team',
      entityId: team.id,
      summary: `Signed up and took over running ${team.name}`,
      organizerId: team.organizerId,
    })
    await enterInvitedTournament(user, team as Team, invite)

    const session = await createSession(user.id, ctx.userAgent, ctx.sourceIp)
    return {
      user: toPublicUser({ ...user, teamIds: [team.id] }),
      token: session.token,
      expiresAt: session.expiresAt,
      teamId: team.id,
    }
  })

  /* ---------------- finding a club to invite ---------------- */

  /**
   * The clubs that have said other organisers may find them.
   *
   * A club is nobody's to advertise but its own, so this list is opt-in and the
   * flag is written by the same people who may edit the club — its managers, or
   * the organiser who owns it while it has none. Everything else about a club
   * is already reachable somewhere; what is new here is being *findable* by
   * somebody who does not run the league it plays in.
   *
   * The caller's own clubs are left out. They are already in `/admin/teams`,
   * and an organiser does not invite a club they can simply tick.
   *
   * The whole directory in one answer rather than a query per keystroke: it is
   * a short list, every round trip from here costs a third of a second, and the
   * browser can narrow a list it already holds.
   */
  router.get('/admin/clubs/directory', async (ctx) => {
    const user = await ctx.user()
    assertIsOrganizer(user)

    const all = (await teams.listAll(adminRead)) as Team[]
    const open = all.filter(
      (team) => team.discoverable === true && team.organizerId !== user.organizerId,
    )
    if (open.length === 0) return []

    // One scan of the accounts table for the whole list rather than a read per
    // manager, the same arrangement `managersOfTeams` uses in admin.ts. Only
    // the name: an email address is the club's to give out, and an organiser
    // who wants this club invites it here rather than writing to it.
    const wanted = new Set<string>()
    for (const team of open) for (const id of team.managerUserIds ?? []) wanted.add(id)

    const managerNames = new Map<string, string>()
    if (wanted.size > 0) {
      for (const account of await scanAll<AuthUser>(TABLES.AUTH_USERS)) {
        if (!wanted.has(account.id) || account.isActive === false) continue
        if (account.displayName) managerNames.set(account.id, account.displayName)
      }
    }

    const organizerNames = new Map(
      (await organizers.list(adminRead)).map((organizer) => [organizer.id, organizer.name]),
    )

    return open
      .map((team) => toDirectoryClub(team, managerNames, organizerNames))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  /**
   * Inviting a club into a competition.
   *
   * The mirror of `POST /manager/entries`, and deliberately the same row: an
   * entry is one club's participation in one competition however the question
   * came to be asked, and two records for it would be two answers to "is this
   * club in" waiting to disagree.
   *
   * What it is not is an entry. A club that has listed itself has agreed to be
   * asked, not to play — so this writes `invited` and stops, and the club's own
   * manager is the only person who can turn that into a place in the season.
   */
  router.post('/admin/tournaments/:id/invitations', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    if (!teamId) throw badRequest('teamId is required')

    const team = (await teams.getOrThrow(teamId)) as Team
    // Being findable and being invitable are the same permission: the club said
    // other organisers may approach it, and nothing else here did.
    if (team.discoverable !== true) {
      throw forbidden('That club is not open to invitations from other organisers')
    }

    if ((tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is already in that competition')
    }

    // A season every match of which has a score is over, and adding a club to
    // it changes a finished table. The application route refuses this for the
    // same reason.
    if (seasonStatus(tournament) === 'finished') {
      throw badRequest('That competition has finished')
    }

    const existing = await getEntry(params.id!, teamId)
    // An invitation already sitting there is returned rather than rewritten, so
    // pressing the button twice does not reset the date the club is looking at.
    if (existing?.status === 'invited') return existing
    if (existing?.status === 'pending') {
      throw badRequest('This club has already applied — answer the application instead')
    }
    if (existing?.status === 'accepted') {
      throw badRequest('This club has already been accepted')
    }

    const invitation: Entry = {
      tournamentId: params.id!,
      teamId,
      organizerId: tournament.organizerId,
      status: 'invited',
      requestedBy: user.id,
      requestedByRole: user.role,
      // The club may have no other way to read it: `/manager/overview` carries
      // nothing about a competition the club is not in, and an unpublished one
      // is on no public list either.
      tournamentName: tournament.name,
      teamOrganizerId: team.organizerId,
      createdAt: new Date().toISOString(),
      // A club that has said no before, or an offer taken back, is worth the
      // organiser seeing on the row rather than a request that reads as new —
      // the same reason an application carries what it replaced.
      previousNote: existing?.note || undefined,
      previousDecidedAt: existing?.decidedAt || undefined,
    }

    let entry: Entry
    try {
      entry = await putEntry(invitation, existing ? existing.status : null)
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // The club answered, or applied, between the read and the write. That is
      // the current state of this entry and the organiser should see it rather
      // than an invitation written on top of it.
      const current = await getEntry(params.id!, teamId)
      if (current) return current
      throw error
    }

    await record(user, {
      action: 'entry.invite',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Invited ${team.name} to join ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return entry
  })

  /* ---------------- a manager's own clubs ---------------- */

  /**
   * Everything the club's page needs: the clubs themselves, the competitions
   * they are in, and any application still waiting on an organizer.
   */
  router.get('/manager/overview', async (ctx) => {
    const user = await ctx.user()
    const claimed = user.teamIds ?? []
    if (claimed.length === 0) return { teams: [], tournaments: [], entries: [] }

    // The account's list of clubs and the club's list of managers are two
    // records, written one after the other: a removal that failed halfway, or a
    // club deleted around the same moment, leaves the account claiming a club
    // it no longer runs. Everything below — the club in full, and which matches
    // count as this caller's own — is decided from the club record, which is
    // where permission is decided everywhere else.
    const myTeams = (await teams.getMany(claimed)).filter((team) =>
      managesTeam(user, team as Team),
    )
    const teamIds = myTeams.map((team) => team.id)
    if (teamIds.length === 0) return { teams: [], tournaments: [], entries: [] }

    const entries = (await Promise.all(teamIds.map((id) => entriesForTeam(id)))).flat()

    // Every public tournament these clubs appear in, plus the ones they have
    // applied to, in full — the club page shows the table and the next match.
    // The manager reading this page is usually the person who just saved a
    // teamsheet or applied to a competition, so this read does not take another
    // container's copy of the list.
    const all = await tournaments.listAll(adminRead)
    const relevant = all.filter((tournament) => {
      const inSquadList = (tournament.teamIds ?? []).some((id: string) => teamIds.includes(id))
      const applied = entries.some((entry) => entry.tournamentId === tournament.id)
      return (inSquadList || applied) && (isPublic(tournament) || inSquadList)
    })

    // The names of everyone these clubs play against: the club page shows
    // "vs Sporting Sydney FC", and a manager only gets their own clubs in full.
    const referenced = new Set<string>()
    for (const tournament of relevant) {
      for (const id of tournament.teamIds ?? []) referenced.add(id)
    }
    const opponents = await teams.getMany([...referenced])
    const teamNames = Object.fromEntries(opponents.map((team) => [team.id, team.name]))

    // An organizer may run a club as well as a competition, and their club may
    // play in somebody else's league. This route answers as the club, so a
    // competition that is not theirs comes back as a participant sees it —
    // otherwise entering a club in a rival's competition was a way to read that
    // competition whole, private ones included.
    const visible = relevant.map((tournament) =>
      user.organizerId && tournament.organizerId === user.organizerId
        ? tournament
        : toClubTournament(tournament, teamIds),
    )

    return { teams: myTeams, tournaments: visible, entries, teamNames }
  })

  /** Applying to a competition. The organizer still has to say yes. */
  router.post('/manager/entries', async (ctx) => {
    const user = await ctx.user()
    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    const tournamentId = typeof ctx.body.tournamentId === 'string' ? ctx.body.tournamentId : ''
    if (!teamId || !tournamentId) throw badRequest('teamId and tournamentId are required')

    const team = await teams.getOrThrow(teamId)
    assertManagesTeam(user, team as Team)

    const tournament = await tournaments.getOrThrow(tournamentId)
    if (!isPublic(tournament)) throw forbidden('That competition is not open for entries')

    // A season every match of which has a score is over, and joining it would
    // change a finished table. The club page never offered these, but the route
    // has to say so itself: it is one request, and there are years of them.
    if (seasonStatus(tournament) === 'finished') {
      throw badRequest('That competition has finished')
    }

    if ((tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is already in that competition')
    }

    const existing = await getEntry(tournamentId, teamId)

    // The organiser has already asked, and this is the club saying yes. Writing
    // a fresh `pending` row on top would throw away a decision the organiser
    // has made and ask them to make it again — and the club pressing "apply"
    // for a competition it was invited to means exactly what accepting means.
    if (existing && existing.status === 'invited') {
      await acceptInvitation(user, tournament, team as Team, existing)
      return { ...existing, status: 'accepted' as const, decidedBy: user.id }
    }

    // A pending application is returned rather than rewritten. That is also
    // what stops a club badgering an organizer: asking again is only possible
    // once the organizer has answered, so every repeat costs them one
    // deliberate decision rather than a stream of identical rows.
    if (existing && existing.status === 'pending') return existing

    // A club turned down once may ask again — circumstances change, and the
    // alternative was a dead end the manager could do nothing about. The
    // decision this replaces is carried onto the new row, so the organizer sees
    // it is a repeat and reads back what they said the first time rather than a
    // request that looks new.
    const replaced = existing && existing.status !== 'pending' ? existing : undefined

    let entry: Entry
    try {
      entry = await putEntry(
        {
          tournamentId,
          teamId,
          organizerId: tournament.organizerId,
          status: 'pending',
          requestedBy: user.id,
          requestedByRole: user.role,
          createdAt: new Date().toISOString(),
          previousNote: replaced?.note || undefined,
          previousDecidedAt: replaced?.decidedAt || undefined,
        },
        existing ? existing.status : null,
      )
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // The organizer decided between the read and the write. Their decision is
      // the current state of the application and the club should see it, not a
      // 'pending' row written on top of it.
      const current = await getEntry(tournamentId, teamId)
      if (current) return current
      throw error
    }

    await record(user, {
      action: 'entry.apply',
      entity: 'tournament',
      entityId: tournamentId,
      summary:
        replaced?.status === 'declined'
          ? `${team.name} applied to join ${tournament.name} again, after being turned down`
          : `${team.name} applied to join ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return entry
  })

  /**
   * The club's answer to an invitation.
   *
   * The other half of `POST /admin/tournaments/:id/invitations`, and the reason
   * that route stops at `invited`: an organiser may offer a place, and only the
   * club may take it. Guarded by `assertManagesTeam`, so it is the club's own
   * managers who answer — or, for a club nobody has taken on, the organiser who
   * owns it, who is the only person there is to ask.
   */
  router.patch('/manager/tournaments/:tournamentId/entry', async (ctx, params) => {
    const user = await ctx.user()

    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    if (!teamId) throw badRequest('teamId is required')

    const status = ctx.body.status
    if (status !== 'accepted' && status !== 'declined') {
      throw badRequest("status must be 'accepted' or 'declined'")
    }

    const team = (await teams.getOrThrow(teamId)) as Team
    assertManagesTeam(user, team)

    const entry = await getEntry(params.tournamentId!, teamId)
    if (!entry) throw notFound('There is no invitation for that club')
    if (entry.status !== 'invited') {
      throw badRequest('That invitation has already been answered')
    }

    assertMayAnswerFor(user, team, entry)

    // Deliberately after the decline branch below, which must work whatever
    // became of the competition: an organiser can delete a season with an
    // invitation outstanding, and a question the club can neither accept nor
    // dismiss would sit on its page for good.
    const tournament = await tournaments.get(params.tournamentId!)

    if (status === 'declined') {
      try {
        await decideEntry(params.tournamentId!, teamId, 'refused', user.id, undefined, 'invited')
      } catch (error) {
        if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
        // The organiser took the invitation back a second ago. Nothing is left
        // to refuse, and saying so beats a 500 on a button that was on screen.
        throw badRequest('That invitation was withdrawn — reload to see where this stands')
      }
      if (tournament) {
        await record(user, {
          action: 'entry.invite_refused',
          entity: 'tournament',
          entityId: params.tournamentId!,
          summary: `${team.name} turned down the invitation to join ${tournament.name}`,
          organizerId: tournament.organizerId,
        })
      }
      return { ok: true }
    }

    if (!tournament) throw notFound('That competition no longer exists')

    // A season that has finished cannot take a new club, whoever asked first.
    // An invitation outlives the season it was issued for.
    if (seasonStatus(tournament) === 'finished') {
      throw badRequest('That competition has finished')
    }

    await acceptInvitation(user, tournament, team, entry)
    return { ok: true }
  })

  /**
   * Which of the club's players are entered in one competition.
   *
   * The same eleven do not necessarily play in the Sunday league and the
   * midweek cup, and a player signed in March should not appear in a list of
   * who played in February. So the selection lives on the competition, keyed by
   * club, and the club's own squad stays untouched by it.
   *
   * What no selection means is the competition's own rule, and `chooseSquad`
   * holds it: everybody in an ordinary competition, nobody in a strict one.
   *
   * This is the club's half of the write. The organiser has one of their own in
   * `admin.ts`, for the many clubs that have no manager yet and for the ones
   * whose manager has gone quiet — the same shape as the teamsheet, which two
   * people can also write for the same reason.
   */
  router.put('/manager/tournaments/:tournamentId/squad', async (ctx, params) => {
    const user = await ctx.user()
    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    if (!teamId) throw badRequest('teamId is required')

    const team = await teams.getOrThrow(teamId)
    assertManagesTeam(user, team as Team)

    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    if (!(tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is not in that competition')
    }

    // The organizer can close squads once the competition is under way. That
    // binds the managers, not the organizer: somebody still has to be able to
    // fix a mistake after the deadline.
    const runsTheCompetition =
      isSuperAdmin(user) || (!!user.organizerId && user.organizerId === tournament.organizerId)
    if (tournament.squadsLocked && !runsTheCompetition) {
      throw forbidden('The organiser has closed squads for this competition')
    }

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
   * Who is playing for this club in one match.
   *
   * The teamsheet is one field of one fixture, and the fixture belongs to the
   * organiser's competition — so the write is narrowed twice over. The club is
   * checked with `assertManagesTeam`, and then the side of the match is read
   * out of the record rather than taken from the request: a manager who could
   * name the side could name their opponent's eleven, and the club id is the
   * only thing their permission was ever established against.
   *
   * There is deliberately no deadline. A teamsheet is a record of who played
   * as much as a declaration of who will, and it is routinely filled in after
   * the final whistle; the organiser can overwrite it either way, and the
   * audit log says who wrote it last.
   */
  router.put('/manager/tournaments/:tournamentId/matches/:matchId/lineup', async (ctx, params) => {
    const user = await ctx.user()
    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    if (!teamId) throw badRequest('teamId is required')

    const team = await teams.getOrThrow(teamId)
    assertManagesTeam(user, team as Team)

    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    // Either home of a fixture. A hand-built playoff keeps its rounds inside
    // the format rather than in `matches`, and a club naming its eleven for one
    // of those is naming it for an ordinary match as far as this route cares.
    const match = locateMatch(tournament, params.matchId!)?.match
    if (!match) throw notFound('Match not found in this tournament')

    const side = sideOfTeam(match, teamId)
    if (!side) throw forbidden('This club is not playing in that match')

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

  /* ---------------- the organizer's side ---------------- */

  router.get('/admin/tournaments/:id/entries', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    // Not a hand-rolled comparison: a team manager has no organizer id at all,
    // and `undefined !== undefined` is false — the inline version let them
    // through on any row whose organizer id was missing.
    assertCanAccessOrganizer(user, tournament.organizerId)

    // The club's name with each row. A club from another organiser can apply
    // here and be invited here, and it is not in the caller's own list of
    // clubs — so the screen that asks them to decide used to say "A club".
    // The name and nothing else: the record itself is not theirs.
    const rows = await entriesForTournament(params.id!)
    if (rows.length === 0) return rows

    const named = await teams.getMany(rows.map((row) => row.teamId))
    const names = new Map(named.map((team) => [team.id, team.name]))
    return rows.map((row) => ({ ...row, teamName: names.get(row.teamId) }))
  })

  /**
   * Accepting or turning down an application.
   *
   * Accepting adds the club to the competition but deliberately does not touch
   * the fixture list: what that should do depends on whether a ball has been
   * kicked yet, and the settings screen already shows the organizer exactly
   * what changing the teams would cost before it does it.
   */
  router.patch('/admin/tournaments/:id/entries/:teamId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    // Not a hand-rolled comparison: a team manager has no organizer id at all,
    // and `undefined !== undefined` is false — the inline version let them
    // through on any row whose organizer id was missing.
    assertCanAccessOrganizer(user, tournament.organizerId)

    const status = ctx.body.status
    if (status !== 'accepted' && status !== 'declined') {
      throw badRequest("status must be 'accepted' or 'declined'")
    }

    const entry = await getEntry(params.id!, params.teamId!)
    if (!entry) throw notFound('No application from that club')

    // An invitation this organiser issued is not theirs to accept: the club has
    // not answered, and accepting for them would make the asking a formality.
    // Turning it down is withdrawing what they offered, which is theirs.
    if (!organiserMayDecide(entry.status, status)) {
      throw badRequest(
        entry.status === 'refused' || entry.status === 'withdrawn'
          ? 'That invitation is closed — invite the club again if you want to ask'
          : 'This club was invited and has not answered yet — only the club can accept',
      )
    }

    // Marking an entry declined does not take the club out of the season — the
    // teams list is written on the settings screen, which shows what changing
    // it costs the fixtures first. Doing it here left the club playing with no
    // record of having agreed, which is also what `/admin/teams` reads to
    // decide whether to name it: the season would have gone on with a club
    // nothing could resolve.
    if (status === 'declined' && (tournament.teamIds ?? []).includes(params.teamId!)) {
      throw badRequest(
        'This club is playing in the competition — take it out of the season first',
      )
    }

    // The three other ways into a season all refuse a finished one; this was
    // the way round them, through an application nobody answered in time.
    if (status === 'accepted' && seasonStatus(tournament) === 'finished') {
      throw badRequest('That competition has finished')
    }

    const note = typeof ctx.body.note === 'string' ? ctx.body.note.trim() : undefined
    const withdrawing = entry.status === 'invited'
    // Taking back an offer the club has not answered is its own status: a row
    // marked `declined` is an application the organiser turned down and may
    // reverse, and this is not that.
    const written: EntryStatus = withdrawing && status === 'declined' ? 'withdrawn' : status

    // Conditional on the state the decision was read in. Both sides write this
    // row: an organiser withdrawing an invitation at the moment the club
    // accepted it would otherwise mark it declined while the club was already
    // in `teamIds`, which is the same bug `putEntry` was made conditional for.
    try {
      await decideEntry(params.id!, params.teamId!, written, user.id, note, entry.status)
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      throw badRequest('That club answered first — reload to see where this stands')
    }

    const team = await teams.get(params.teamId!)

    // Appended under a condition rather than written as a whole list read
    // before the decision: an organizer accepting one club while another was
    // being added elsewhere used to drop whichever write landed first.
    if (status === 'accepted') {
      await tournaments.addTeam(params.id!, params.teamId!)
    }

    await record(user, {
      action: `entry.${written}`,
      entity: 'tournament',
      entityId: params.id!,
      summary: withdrawing
        ? `Withdrew the invitation for ${team?.name ?? 'a club'} to join ${tournament.name}`
        : `${status === 'accepted' ? 'Accepted' : 'Turned down'} ${
            team?.name ?? 'a club'
          } for ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { ok: true }
  })
}

/**
 * Whether this caller may answer this invitation in the club's name.
 *
 * A super admin can move a club to another organiser, and an invitation is not
 * torn up when they do. The club's own managers answer for it wherever it
 * sits — the question was put to them. An organiser answering because nobody
 * has claimed the club is standing in for a club that belonged to somebody else
 * when the question was asked, and that is not theirs to answer.
 * `enterInvitedTournament` re-checks the same pairing on a `TeamInvite`, for the
 * same reason and with the same argument.
 */
function assertMayAnswerFor(user: AuthUser, team: Team, entry: Entry): void {
  if (managesTeam(user, team)) return
  if (entry.teamOrganizerId && entry.teamOrganizerId !== team.organizerId) {
    throw forbidden('This club has changed hands since it was invited')
  }
}

/**
 * The club taking up an invitation.
 *
 * Two callers: the club answering the invitation on its own page, and the club
 * applying to a competition it turns out to have been invited to already.
 *
 * The write is conditional on the row still saying `invited`, because the
 * organiser can withdraw what they offered and a club accepting a second later
 * would otherwise put itself into a season nobody currently wants it in. The
 * decision is recorded before the club is added, the same order the organiser's
 * own route uses: an entry marked accepted with the club missing from `teamIds`
 * is a competition the organiser can still add it to, and the reverse is a
 * place in a season with no record of who agreed to it.
 */
async function acceptInvitation(
  user: AuthUser,
  tournament: Tournament,
  team: Team,
  entry: Entry,
): Promise<void> {
  // Here rather than only in the route that answers on screen: the apply route
  // reaches this too, by treating a club's application to a competition it was
  // already invited to as the acceptance it plainly is.
  assertMayAnswerFor(user, team, entry)

  try {
    await decideEntry(tournament.id, team.id, 'accepted', user.id, undefined, 'invited')
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    // The organiser took the invitation back between the read and this write.
    // The condition did its job; what is left is saying so rather than
    // answering 500 to somebody who pressed a button that was on screen.
    throw badRequest('That invitation was withdrawn — reload to see where this stands')
  }

  await tournaments.addTeam(tournament.id, team.id)

  await record(user, {
    action: 'entry.invite_accepted',
    entity: 'tournament',
    entityId: tournament.id,
    summary: `${team.name} accepted the invitation to join ${tournament.name}`,
    organizerId: tournament.organizerId,
  })
}

/**
 * Puts a newly claimed club into the competition its invitation named.
 *
 * The authority for this write is the invitation: it was issued by somebody who
 * could already have added the club by hand, and the token proves the person
 * following the link is the one they gave it to. That is why the new manager's
 * own permissions are not consulted — a manager cannot enter a club anywhere
 * without the organizer agreeing, and this is the organizer having agreed in
 * advance.
 *
 * What that authority does not survive is the club changing hands. A super
 * admin can move a club to another organizer, and invitations are not torn up
 * when that happens, so the pairing is checked again here rather than taken
 * from a fortnight-old token.
 *
 * Nothing here fails the claim, and that is enforced rather than hoped for: the
 * club changing hands is the thing the person came to do, and a competition
 * deleted or finished in the meantime must not cost them the invitation, the
 * account and the session all at once.
 */
async function enterInvitedTournament(
  user: AuthUser,
  team: Team,
  invite: TeamInvite,
): Promise<void> {
  if (!invite.tournamentId) return

  try {
    const tournament = await tournaments.get(invite.tournamentId)
    if (!tournament) return

    // The club has moved to another organizer since the invitation was written.
    // Entering it in a competition its present owner does not run is not what
    // anybody agreed to.
    if (tournament.organizerId !== team.organizerId) return

    // A season every match of which has a score is over, and adding a club to
    // it changes a finished table. The application route refuses this for the
    // same reason; an invitation lasts a fortnight, which is long enough for a
    // season to end inside it.
    if (seasonStatus(tournament) === 'finished') return

    const added = await tournaments.addTeam(tournament.id, team.id)

    // An application already on the row would otherwise leave the club both in
    // the competition and, on its own page, refused by it. The organizer's
    // earlier answer is being overruled by the organizer's own invitation, so
    // it is overruled in the audit log too rather than quietly.
    const existing = await getEntry(tournament.id, team.id)
    const overruled = existing && existing.status !== 'accepted' ? existing.status : null
    if (overruled) {
      // Conditional on what was read: this overrules an answer, which is worth
      // doing to the answer that is actually there and not to whichever one
      // landed while the claim was in flight.
      await decideEntry(tournament.id, team.id, 'accepted', invite.createdBy, undefined, overruled)
    }

    if (!added && !overruled) return

    // Deliberately not touching the fixtures, for the same reason accepting an
    // application does not: what a new club should do to a draw depends on
    // whether a ball has been kicked, and the settings screen is where the
    // organizer is shown that cost before paying it.
    await record(user, {
      action: 'entry.invited',
      entity: 'tournament',
      entityId: tournament.id,
      summary: overruled
        ? `${team.name} entered ${tournament.name} through the organiser's invitation, replacing an application marked ${overruled}`
        : `${team.name} entered ${tournament.name} through the organiser's invitation`,
      organizerId: tournament.organizerId,
    })
  } catch (error) {
    // The club has changed hands either way. Losing that to a competition that
    // was deleted mid-signup would burn the invitation with nothing to show.
    console.error('Entering an invited club in its competition failed', error)
  }
}

/** Local to this file: the auth routes own the shared version. */
async function findActiveUserByEmail(email: string): Promise<AuthUser | null> {
  const { findUserByCredential } = await import('./auth.js')
  return findUserByCredential(email)
}
