import {
  ddb,
  DeleteCommand,
  GetCommand,
  PutCommand,
  queryAll,
  scanAll,
  UpdateCommand,
} from './lib/ddb.js'
import { TABLES } from './lib/env.js'
import {
  inviteEnvelope,
  putInvite,
  readInvite,
  spendInvite,
  type InviteBase,
} from './lib/invites.js'
import { generateId } from './lib/passwords.js'
import { notFound } from './lib/http.js'
import type { Condition } from './lib/club-managers.js'
import { getUserById } from './lib/sessions.js'
import type { AuthUser, Team } from './lib/types.js'

/**
 * Clubs, the people who run them, and their applications to competitions.
 *
 * Two ideas live here, and keeping them apart is what makes the permissions
 * simple: a **club** is the club — its name, crest and squad — and belongs to
 * whoever runs it; an **entry** is that club's participation in one
 * competition, and belongs to the organizer of that competition.
 */

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

export type TeamInvite = InviteBase & {
  kind?: 'team'
  teamId: string
  teamName: string
  organizerId: string
  /**
   * The competition the club joins the moment the invitation is taken up.
   *
   * An organizer inviting a coach from inside a competition is not only handing
   * over a club, they are entering it: making the manager apply afterwards, to
   * the person who just invited them, is a decision already taken. The name is
   * copied so the claim page can say where the club is going without a second
   * read, and so a competition renamed in the meantime still reads sensibly.
   */
  tournamentId?: string
  tournamentName?: string
  /**
   * Who wrote it: the organizer who owns the club, or the club's own head
   * manager bringing in a helper. Absent on everything written before a club
   * could invite, all of which were the organizer's.
   *
   * It matters at the claim. An invitation the organizer wrote cannot put the
   * organizer themselves on a club somebody already runs — that would be the
   * owner stepping round the manager. One the club wrote can: the head asked.
   */
  issuedBy?: 'organizer' | 'club'
}

export async function createInvite(
  team: Team,
  createdBy: string,
  options: {
    email?: string
    tournament?: { id: string; name: string }
    issuedBy?: 'organizer' | 'club'
  } = {},
): Promise<TeamInvite> {
  const invite: TeamInvite = {
    ...inviteEnvelope('team', createdBy, options.email),
    kind: 'team',
    teamId: team.id,
    teamName: team.name,
    organizerId: team.organizerId,
    tournamentId: options.tournament?.id,
    tournamentName: options.tournament?.name,
    issuedBy: options.issuedBy ?? 'organizer',
  }

  await putInvite(invite)
  return invite
}

/**
 * The invitations a club has written for its own helpers and nobody has used.
 *
 * A scan: the table is keyed by token alone and holds a handful of live rows,
 * the same trade `deleteInvitesOfOrganizer` makes. Only the club's own — an
 * organizer's link may carry a competition entry, and is the organizer's to
 * withdraw, not the club's.
 */
export async function listClubInvites(teamId: string): Promise<TeamInvite[]> {
  const all = await scanAll<TeamInvite>(TABLES.INVITES)
  const now = Date.now()
  return all.filter((invite) => {
    if ((invite.kind ?? 'team') !== 'team') return false
    if (invite.teamId !== teamId || invite.issuedBy !== 'club') return false
    const expiresAt = new Date(invite.expiresAt).getTime()
    return Number.isFinite(expiresAt) && expiresAt >= now
  })
}

/**
 * Withdraws one of the club's own invitations.
 *
 * Conditional on the row still being this club's and the club's to withdraw,
 * because the token arrives in the request and a token for another club, or
 * one the organizer wrote, must not be deletable by knowing it.
 */
export async function cancelClubInvite(token: string, teamId: string): Promise<boolean> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.INVITES,
        Key: { token },
        ConditionExpression: '#team = :teamId AND #issuedBy = :club',
        ExpressionAttributeNames: { '#team': 'teamId', '#issuedBy': 'issuedBy' },
        ExpressionAttributeValues: { ':teamId': teamId, ':club': 'club' },
      }),
    )
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

/**
 * Withdraws every link one person wrote for a club.
 *
 * Run when a head hands the role on: their successor cannot see those links
 * (the listing is the current head's) and so cannot withdraw them, and they
 * would come back to life if the role were ever handed back.
 */
export async function deleteClubInvitesBy(teamId: string, createdBy: string): Promise<void> {
  for (const invite of await listClubInvites(teamId)) {
    if (invite.createdBy !== createdBy) continue
    await cancelClubInvite(invite.token, teamId)
  }
}

/**
 * Hands the head of a club to another of its managers.
 *
 * Conditional on the caller still being the head, in the shape the route read
 * it (`headCondition`), and on the new head still being on the list — somebody
 * removed in the same second must not come back in charge.
 */
export async function setHeadManager(
  teamId: string,
  newHeadId: string,
  stillHead: Condition,
): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        UpdateExpression: 'SET #head = :newHead',
        ConditionExpression: `contains(#managers, :newHead) AND (${stillHead.expression})`,
        ExpressionAttributeNames: {
          '#head': 'headManagerId',
          '#managers': 'managerUserIds',
          ...stillHead.names,
        },
        ExpressionAttributeValues: { ':newHead': newHeadId, ...stillHead.values },
      }),
    )
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

/**
 * Reads an invitation without spending it, to show who is being invited where.
 *
 * A token that names an organizer invitation is not one of these and answers
 * null, so the club claim route cannot spend it — see `lib/invites.ts`.
 */
export async function peekInvite(token: string): Promise<TeamInvite | null> {
  return readInvite<TeamInvite>(token, 'team')
}

/** Spends it. An invitation opens one door, once. */
export async function consumeInvite(token: string): Promise<TeamInvite | null> {
  const invite = await peekInvite(token)
  if (!invite) return null
  return (await spendInvite(token)) ? invite : null
}

/* ------------------------------------------------------------------ *
 * Who runs a club
 * ------------------------------------------------------------------ */

/**
 * Records that a person runs a club, on both records at once.
 *
 * The link is stored on the team and on the user because both directions are
 * asked constantly — "who may edit this club" and "which clubs are mine" — and
 * neither should cost a table scan. Writing them anywhere but here is how they
 * would drift apart.
 */
export async function linkManagerToTeam(user: AuthUser, team: Team): Promise<void> {
  // Both lists are appended to in place rather than written from a copy read a
  // moment ago. The whole-list write this replaces lost data in two directions:
  // two people claiming clubs at the same time dropped one of them, and a claim
  // overlapping the organizer removing a manager put the removed manager back —
  // and `managerUserIds` is the list permissions are decided from, so that
  // handed a club back to somebody who had just lost it.
  //
  // The date map has to exist before a key inside it can be written, and the
  // two cannot be one expression: DynamoDB rejects overlapping paths.
  if (!(await ensureLinkedAtMap(team.id))) throw notFound('That club no longer exists')

  // A head's name left behind by a removal whose tidy-up did not land would
  // make this person the head again the moment they are back on the list.
  // Best effort: `headManagerOf` ignores such a name already, and this runs
  // after an invitation has been spent.
  try {
    await clearStaleHead(team.id, user.id)
  } catch {
    // See above.
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: team.id },
        UpdateExpression:
          'SET managerUserIds = list_append(if_not_exists(managerUserIds, :emptyList), :one), managerLinkedAt.#user = :at',
        ConditionExpression:
          'attribute_not_exists(managerUserIds) OR NOT contains(managerUserIds, :userId)',
        ExpressionAttributeNames: { '#user': user.id },
        ExpressionAttributeValues: {
          ':emptyList': [],
          ':one': [user.id],
          ':userId': user.id,
          ':at': new Date().toISOString(),
        },
      }),
    )
  } catch (error) {
    // Already runs this club. The link and the date it came with are there, and
    // opening a second invitation should not move the date.
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET teamIds = list_append(if_not_exists(teamIds, :emptyList), :one)',
        ConditionExpression: 'attribute_not_exists(teamIds) OR NOT contains(teamIds, :teamId)',
        ExpressionAttributeValues: {
          ':emptyList': [],
          ':one': [team.id],
          ':teamId': team.id,
        },
      }),
    )
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
  }
}

/**
 * The date map has to exist before a key inside it can be written or removed:
 * DynamoDB refuses a document path through a parent that is not there, and
 * clubs claimed before the map existed have none.
 */
async function ensureLinkedAtMap(teamId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        UpdateExpression: 'SET managerLinkedAt = if_not_exists(managerLinkedAt, :emptyMap)',
        // An update is an upsert. Deleting a club unlinks its managers after
        // the record is gone, and without this the unlink wrote the club back
        // as a record holding nothing but an id — a nameless club in every
        // list that reads the table.
        ConditionExpression: 'attribute_exists(#id)',
        ExpressionAttributeNames: { '#id': 'id' },
        ExpressionAttributeValues: { ':emptyMap': {} },
      }),
    )
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

/**
 * Takes a head's name off a club where that person is no longer a manager.
 *
 * `headManagerOf` already ignores such a name, so this is what keeps it from
 * coming back to life on a later link, not what keeps it from counting now.
 * Conditional on both halves, so it never touches a head who is on the list.
 */
async function clearStaleHead(teamId: string, userId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: teamId },
        UpdateExpression: 'REMOVE #head',
        ConditionExpression:
          '#head = :userId AND (attribute_not_exists(#managers) OR NOT contains(#managers, :userId))',
        ExpressionAttributeNames: { '#head': 'headManagerId', '#managers': 'managerUserIds' },
        ExpressionAttributeValues: { ':userId': userId },
      }),
    )
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
  }
}

/**
 * Drops the manager links an organizer held over their own club when the club
 * moves to somebody else.
 *
 * The link is granted on ownership — "this is my club, I run it as well" — but
 * honoured afterwards on identity alone, so moving a club to another organizer
 * left the previous owner editing a squad inside somebody else's league, and
 * indistinguishable in the manager list from an invited coach. An invited
 * manager keeps the club: their link came from an invitation, and the club
 * changing hands is not their business.
 */
export async function unlinkOwnerManagers(team: Team, previousOrganizerId: string): Promise<void> {
  for (const managerId of team.managerUserIds ?? []) {
    const account = await getUserById(managerId)
    // Only an organizer's own account carries an organizerId, so an invited
    // coach never matches this and is left alone.
    if (!account?.organizerId || account.organizerId !== previousOrganizerId) continue
    // A super admin carrying an organizerId is a mistake in the data, not an
    // organizer, and their link was not granted by owning the club.
    if (account.role === 'super_admin') continue
    await unlinkManagerFromTeam(managerId, team)
  }
}

/**
 * Takes somebody off a club, on both records.
 *
 * Removed by index with the index checked in the same request, the way one
 * player is edited inside a squad. Writing the filtered list back whole would
 * erase a manager linked in the same moment — and the reverse of that mistake,
 * a whole-list write on the linking side, is the one that used to restore a
 * manager the organizer had just removed.
 */
export async function unlinkManagerFromTeam(
  userId: string,
  team: Team,
  /**
   * What must still be true for this removal to go ahead, worked out afresh
   * from every read — the head manager's removal of a helper passes the
   * condition that they are still the head (`headCondition`). Answering null
   * means the fresh read no longer allows it, and nothing is written.
   */
  guard?: (current: Team) => Condition | null,
): Promise<boolean> {
  let current: Team | null = team
  let removed = false

  // A club already deleted has nothing to take the person off — only their
  // account's list is left to tidy, which is what the loop below skips to.
  if ((team.managerUserIds ?? []).includes(userId) && !(await ensureLinkedAtMap(team.id))) {
    current = null
  }

  for (let attempt = 0; attempt < 3 && current; attempt++) {
    const index = (current.managerUserIds ?? []).indexOf(userId)
    if (index === -1) break

    const extra = guard ? guard(current) : undefined
    if (extra === null) return false

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TEAMS,
          Key: { id: team.id },
          UpdateExpression: `REMOVE managerUserIds[${index}], managerLinkedAt.#user`,
          ConditionExpression: extra
            ? `managerUserIds[${index}] = :userId AND (${extra.expression})`
            : `managerUserIds[${index}] = :userId`,
          ExpressionAttributeNames: { '#user': userId, ...(extra?.names ?? {}) },
          ExpressionAttributeValues: { ':userId': userId, ...(extra?.values ?? {}) },
        }),
      )
      removed = true
      break
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // Somebody else moved the list between the read and the write. Read it
      // again rather than removing whatever now sits at that position — and
      // consistently, or a stale answer comes back three times over.
      const fresh = await ddb.send(
        new GetCommand({ TableName: TABLES.TEAMS, Key: { id: team.id }, ConsistentRead: true }),
      )
      current = (fresh.Item as Team | undefined) ?? null
    }
  }

  // A guarded removal that never happened must not touch the account either
  // (a deleted club is not a refusal: there is nothing left to guard):
  // the account's list is the other half of a link the club still holds.
  if (guard && !removed && current) return false

  // The head is named by id, and an id left behind would make them the head
  // again the day they are invited back. Attempted on every removal rather
  // than only when the read named them, because the head can change between
  // that read and this write; the condition decides. Tidiness and not the
  // guard — `headManagerOf` already ignores such a name, and `linkManagerToTeam`
  // clears it again — so no failure here may fail a removal that has happened.
  if (removed) {
    try {
      await clearStaleHead(team.id, userId)
    } catch {
      // See above.
    }
  }

  const result = await ddb.send(new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id: userId } }))
  let account = result.Item as AuthUser | undefined
  if (!account) return true

  for (let attempt = 0; attempt < 3 && account; attempt++) {
    const index = (account.teamIds ?? []).indexOf(team.id)
    if (index === -1) break

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.AUTH_USERS,
          Key: { id: userId },
          UpdateExpression: `REMOVE teamIds[${index}]`,
          ConditionExpression: `teamIds[${index}] = :teamId`,
          ExpressionAttributeValues: { ':teamId': team.id },
        }),
      )
      break
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      const fresh = await ddb.send(
        new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id: userId } }),
      )
      account = fresh.Item as AuthUser | undefined
    }
  }
  return true
}

/* ------------------------------------------------------------------ *
 * Entries: a club's participation in one competition
 * ------------------------------------------------------------------ */

/**
 * Where one club's participation in one competition has got to.
 *
 * `pending` and `invited` are the same row asked from opposite ends: the club
 * applied and the organiser has not answered, or the organiser invited and the
 * club has not. Which of the two it is decides who may write the next status —
 * an organiser must not be able to accept their own invitation on the club's
 * behalf, which is the whole point of asking.
 *
 * The three ways of saying no are three statuses because they are three
 * different facts and the wrong one is a hole. `declined` is the organiser
 * turning down an application, which they may reverse — they are the person
 * whose answer it was. `refused` is the club turning down an invitation, which
 * the organiser may not reverse; asking again means inviting again, which the
 * club answers again. `withdrawn` is the organiser taking back an invitation
 * the club had not yet answered.
 */
export type EntryStatus =
  | 'pending'
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'refused'
  | 'withdrawn'

export type Entry = {
  tournamentId: string
  teamId: string
  organizerId: string
  status: EntryStatus
  requestedBy: string
  requestedByRole: string
  decidedBy?: string
  createdAt: string
  decidedAt?: string
  /** Why an application was turned down, when the organizer says. */
  note?: string
  /**
   * Who owned the club when the invitation was issued.
   *
   * A super admin can move a club to another organiser, and an invitation is
   * not torn up when they do — so without this the new owner inherits a
   * question they never saw asked and, for a club nobody has claimed, answers
   * it in the club's name. `enterInvitedTournament` re-checks the same pairing
   * on a `TeamInvite` and for the same reason. A club with a manager of its own
   * is unaffected: the person answering is the club either way.
   */
  teamOrganizerId?: string
  /**
   * The competition's name, copied onto an invitation when it is issued.
   *
   * A club invited to a season that is not published has no way to read its
   * name: `/manager/overview` deliberately carries nothing about a competition
   * the club is not in yet, and a private one is not on the public list either.
   * Without this the invitation arrives naming nothing. Copied rather than
   * looked up, for the same reason `TeamInvite` copies it: one read fewer, and
   * a competition renamed afterwards still reads sensibly.
   */
  tournamentName?: string
  /**
   * The decision this application replaced, when a club asks again after having
   * been turned down. One row holds one status, so without these the organizer
   * would see a fresh request with no sign they had already answered it, and
   * the reason they gave would be gone.
   */
  previousNote?: string
  previousDecidedAt?: string
}

/**
 * Writes an entry, optionally only while it is still in the state the caller
 * read.
 *
 * This is a whole-item Put, and both sides can write the same row: the club
 * applies, the organizer decides. Passing `expected` makes the write fail
 * rather than land on top of a decision made in between — a manager pressing
 * "apply again" at the moment the organizer pressed "accept" would otherwise
 * put the row back to 'pending' while the club is already in the competition.
 * `null` means the row must not exist at all.
 */
export async function putEntry(entry: Entry, expected?: EntryStatus | null): Promise<Entry> {
  const condition =
    expected === undefined
      ? {}
      : expected === null
        ? { ConditionExpression: 'attribute_not_exists(tournamentId)' }
        : {
            ConditionExpression: '#status = :expected',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expected': expected },
          }

  await ddb.send(new PutCommand({ TableName: TABLES.ENTRIES, Item: entry, ...condition }))
  return entry
}

export async function getEntry(tournamentId: string, teamId: string): Promise<Entry | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.ENTRIES, Key: { tournamentId, teamId } }),
  )
  return (result.Item as Entry | undefined) ?? null
}

export async function entriesForTournament(tournamentId: string): Promise<Entry[]> {
  return queryAll<Entry>({
    TableName: TABLES.ENTRIES,
    KeyConditionExpression: 'tournamentId = :tournamentId',
    ExpressionAttributeValues: { ':tournamentId': tournamentId },
  })
}

/**
 * Invitations an organizer issued, which die with them.
 *
 * An invitation is a link that hands a club to whoever opens it, and claiming
 * one creates an account. Left behind, an invitation written by a deleted
 * organizer would still work a fortnight later — against a club that has since
 * moved to somebody else, who never invited anybody. Deleting the organizer's
 * sessions and leaving these would be closing one door and leaving the other
 * open.
 *
 * It takes the invitation to run the organizer itself with it, which is the
 * same argument one step further up: that link opens an account for a league
 * that no longer exists. Both kinds carry `organizerId`, so both are matched
 * here and neither needs a pass of its own.
 */
export async function deleteInvitesOfOrganizer(organizerId: string): Promise<number> {
  const all = await scanAll<{ token: string; organizerId?: string }>(TABLES.INVITES)
  const doomed = all.filter((invite) => invite.organizerId === organizerId)
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}

/**
 * Removes every application to a competition that is going away.
 *
 * An entry is keyed by the tournament it belongs to, so once the tournament is
 * deleted the row is unreachable through the interface but still counts against
 * the club: `entriesForTeam` keeps returning it, and the club shows as pending
 * in a competition nobody can open.
 */
export async function deleteEntriesForTournament(tournamentId: string): Promise<number> {
  const entries = await entriesForTournament(tournamentId)
  for (const entry of entries) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.ENTRIES,
        Key: { tournamentId: entry.tournamentId, teamId: entry.teamId },
      }),
    )
  }
  return entries.length
}

/**
 * Removes every entry belonging to a club that is going away.
 *
 * The mirror of `deleteEntriesForTournament`, and needed for the same reason:
 * an entry is keyed by the tournament, so a row about a deleted club stays
 * reachable from the organiser's side and shows as an application from a club
 * whose name nothing can resolve.
 */
export async function deleteEntriesForTeam(teamId: string): Promise<number> {
  const entries = await entriesForTeam(teamId)
  for (const entry of entries) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.ENTRIES,
        Key: { tournamentId: entry.tournamentId, teamId: entry.teamId },
      }),
    )
  }
  return entries.length
}

export async function entriesForTeam(teamId: string): Promise<Entry[]> {
  return queryAll<Entry>({
    TableName: TABLES.ENTRIES,
    IndexName: 'teamId-index',
    KeyConditionExpression: 'teamId = :teamId',
    ExpressionAttributeValues: { ':teamId': teamId },
  })
}

/**
 * Records the answer to an application or an invitation.
 *
 * `expected` makes the write conditional on the status the caller read, the way
 * `putEntry` does and for the same reason: an invitation and its withdrawal are
 * written by two different people, and accepting one the organiser withdrew a
 * moment ago would put a club in a competition nobody currently wants it in.
 * Left out, the write lands unconditionally — which is what the organiser's own
 * decision on an application it has already read has always done.
 */
export async function decideEntry(
  tournamentId: string,
  teamId: string,
  status: EntryStatus,
  decidedBy: string,
  note?: string,
  expected?: EntryStatus,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.ENTRIES,
      Key: { tournamentId, teamId },
      UpdateExpression:
        'SET #status = :status, decidedBy = :decidedBy, decidedAt = :decidedAt, note = :note',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':decidedBy': decidedBy,
        ':decidedAt': new Date().toISOString(),
        ':note': note ?? null,
        ...(expected ? { ':expected': expected } : {}),
      },
      ...(expected ? { ConditionExpression: '#status = :expected' } : {}),
    }),
  )
}

export const newEntryId = generateId
