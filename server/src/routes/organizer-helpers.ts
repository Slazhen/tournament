import { ddb, PutCommand, scanAll } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { badRequest, notFound } from '../lib/http.js'
import { assertCanAccessOrganizer } from '../lib/auth.js'
import { assertPasswordStrength, generateId, generateSalt, hashPassword } from '../lib/passwords.js'
import { createSession, deleteAllUserSessions, getUserById } from '../lib/sessions.js'
import { toPublicUser, type AuthUser, type Organizer, type Team } from '../lib/types.js'
import { organizers, teams } from '../repos.js'
import { unlinkManagerFromTeam } from '../repos-clubs.js'
import {
  anyAccountOnEmail,
  consumeHelperInvite,
  createHelperInvite,
  deleteHelperInvites,
  deleteInvitesWrittenBy,
  makeClubManagerHelper,
  peekHelperInvite,
  pendingHelperInvites,
  reactivateHelper,
  revokeHelper,
  setOrganizerOwner,
} from '../repos-organizer-helpers.js'
import {
  assertOrganizerOwner,
  grantedByOrganizer,
  helperClaimMode,
  MAX_HELPERS,
  membersOf,
  ownerOf,
  readHelperEmail,
  revocationOf,
} from '../lib/organizer-helpers.js'
import { sendHelperInvite } from '../lib/mail.js'
import { record } from '../lib/audit.js'
import { liveRead } from '../lib/cache.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

/**
 * Every account carrying this organizerId, live or not.
 *
 * A scan of a table holding a handful of rows, projected so the password
 * hashes never leave DynamoDB; the same read `accountsOfOrganizer` in
 * `routes/admin.ts` makes. Read fresh on every request: who is the owner is a
 * decision, and a cached list would make it about a minute ago.
 */
export async function accountsOf(organizerId: string): Promise<AuthUser[]> {
  const all = await scanAll<AuthUser>(TABLES.AUTH_USERS, [
    'id',
    'email',
    'displayName',
    'role',
    'organizerId',
    'isActive',
    'createdAt',
    'organizerSince',
    'lastLogin',
    'teamIds',
  ])
  return all.filter((account) => account.organizerId === organizerId)
}

/** The organiser, read past every cache, or 404. */
async function organizerOrThrow(id: string): Promise<Organizer> {
  const organizer = await organizers.readConsistently(id)
  if (!organizer) throw notFound('Organizer not found')
  return organizer
}

/**
 * The organiser's own record is the owner's: its name is its public address,
 * and renaming it moves every link anybody has to its competitions.
 */
export async function assertMayEditOrganizerRecord(user: AuthUser, organizerId: string): Promise<void> {
  assertCanAccessOrganizer(user, organizerId)
  if (user.role === 'super_admin') return
  const organizer = await organizerOrThrow(organizerId)
  assertOrganizerOwner(user, organizer, await accountsOf(organizerId))
}

export function registerOrganizerHelperRoutes(router: Router<RequestContext>): void {
  /**
   * Who runs this organiser, and who has been asked.
   *
   * Every member reads the list, the way a club's managers see each other:
   * they run it together. The open links are the owner's alone, because only
   * the owner can do anything with them.
   */
  router.get('/admin/organizers/:id/helpers', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizerOrThrow(params.id!)
    const accounts = await accountsOf(organizer.id)
    const owner = ownerOf(organizer, accounts)
    const mayManage = user.role === 'super_admin' || owner?.id === user.id

    const invites = mayManage ? await pendingHelperInvites(organizer.id) : []
    return {
      members: membersOf(organizer.id, accounts).map((account) => ({
        id: account.id,
        email: account.email ?? '',
        displayName: account.displayName,
        isOwner: account.id === owner?.id,
        isYou: account.id === user.id,
        lastLogin: account.lastLogin,
        runsClubs: (account.teamIds?.length ?? 0) > 0,
      })),
      invites: invites
        .map((invite) => ({ email: invite.email, expiresAt: invite.expiresAt }))
        .sort((a, b) => a.email.localeCompare(b.email)),
      mayManage,
      maxHelpers: MAX_HELPERS,
    }
  })

  /**
   * Invites somebody to help run this organiser.
   *
   * Everything that would make the link useless is refused here rather than at
   * the claim, so the owner learns it now and not through somebody else's dead
   * link. The address decides what the link will do (`helperClaimMode`).
   */
  router.post('/admin/organizers/:id/helper-invites', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizerOrThrow(params.id!)
    const accounts = await accountsOf(organizer.id)
    assertOrganizerOwner(user, organizer, accounts)

    const email = readHelperEmail(ctx.body.email)
    const decision = helperClaimMode(await anyAccountOnEmail(email), organizer.id)
    if ('refused' in decision) throw badRequest(decision.refused)

    // The owner is named before anybody else can join. Until now it was only
    // ever "the longest-serving account", which is a rule about who is here,
    // and the first helper to arrive is the first moment that rule can give a
    // different answer from the one everybody meant.
    const owner = ownerOf(organizer, accounts)
    if (owner && organizer.ownerUserId !== owner.id) {
      if (!(await setOrganizerOwner(organizer.id, owner.id, organizer.ownerUserId))) {
        throw badRequest('The owner changed in the meantime. Reload and try again.')
      }
    }

    // Counted from a read, so a ceiling rather than a guard. The link being
    // replaced does not count against its own replacement.
    const helpers = membersOf(organizer.id, accounts).filter((member) => member.id !== owner?.id)
    const pending = (await pendingHelperInvites(organizer.id)).filter((invite) => invite.email !== email)
    if (helpers.length + pending.length >= MAX_HELPERS) {
      throw badRequest(
        `An organizer can have ${MAX_HELPERS} helpers, invitations included. Remove one or cancel an invitation first.`,
      )
    }

    await deleteHelperInvites(organizer.id, email)
    const invite = await createHelperInvite(organizer, user.id, email)
    const link = `${SITE_URL}/join-helper?token=${invite.token}`
    const mail = await sendHelperInvite(email, organizer.name, link)

    await record(user, {
      action: 'organizer.helper_invite',
      entity: 'organizer',
      entityId: organizer.id,
      summary: mail.sent
        ? `Emailed ${email} an invitation to help run ${organizer.name}`
        : `Created a link for ${email} to help run ${organizer.name}`,
      organizerId: organizer.id,
    })
    return { link, expiresAt: invite.expiresAt, emailed: mail.sent, email }
  })

  /** Takes back the link to one address. Query rather than body: a DELETE carries none here. */
  router.delete('/admin/organizers/:id/helper-invites', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizerOrThrow(params.id!)
    assertOrganizerOwner(user, organizer, await accountsOf(organizer.id))

    const email = readHelperEmail(ctx.query?.email)
    const cancelled = await deleteHelperInvites(organizer.id, email)
    if (cancelled > 0) {
      await record(user, {
        action: 'organizer.helper_invite_cancel',
        entity: 'organizer',
        entityId: organizer.id,
        summary: `Cancelled the invitation to ${email}`,
        organizerId: organizer.id,
      })
    }
    return { cancelled }
  })

  /**
   * Removes a helper.
   *
   * Never the owner: an organiser must keep somebody who can invite, and the
   * way to step down is to hand the organiser on first. The account is read
   * again whole, because what happens to it depends on whether it runs clubs
   * (`revocationOf`). A switched-off account's sessions go with it; `authenticate`
   * would refuse them anyway, but a token that cannot be used should not exist.
   */
  router.delete('/admin/organizers/:id/helpers/:userId', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizerOrThrow(params.id!)
    const accounts = await accountsOf(organizer.id)
    assertOrganizerOwner(user, organizer, accounts)

    const owner = ownerOf(organizer, accounts)
    if (params.userId === owner?.id) {
      throw badRequest('The owner cannot be removed. Hand the organizer to somebody else first.')
    }
    const target = membersOf(organizer.id, accounts).find((member) => member.id === params.userId)
    if (!target) throw notFound('That person does not help run this organizer')

    // What they did as a helper goes with them. Their open invitations, so no
    // link they wrote lets them back in on another login. And the clubs of this
    // organiser they put themselves on as its organiser, which they held by
    // owning the club, exactly as a club that moves away drops those links
    // (`grantedByOrganizer`). A club they ran before they joined is theirs.
    //
    // The clubs are found from the organiser's side, by `managerUserIds`, not
    // from the account's `teamIds`: the two are written one after the other
    // and can disagree, and a link missing from the account's list would
    // survive the removal and come back with the next invitation.
    //
    // These happen before the account write below, which can still refuse if
    // the account changed in the meantime. Then the helper has lost their
    // links and is still a helper; pressing Remove again finishes it, and
    // nothing here hands anybody anything.
    await deleteInvitesWrittenBy(organizer.id, target.id)
    const before = await getUserById(target.id)
    if (!before) throw notFound('That person does not help run this organizer')
    for (const team of await teams.listByOrganizer(organizer.id, liveRead)) {
      if (!(team.managerUserIds ?? []).includes(before.id)) continue
      if (grantedByOrganizer(team, before, organizer.id)) {
        await unlinkManagerFromTeam(before.id, team as Team)
      }
    }

    // Read again whole: what happens to the account depends on whether it
    // still runs clubs (`revocationOf`).
    const fresh = await getUserById(target.id)
    if (!fresh) throw notFound('That person does not help run this organizer')
    const how = revocationOf(fresh)
    if (!(await revokeHelper(fresh.id, organizer.id, how))) {
      throw badRequest('That account changed in the meantime. Reload and try again.')
    }
    if (how === 'deactivate') await deleteAllUserSessions(fresh.id)

    await record(user, {
      action: 'organizer.helper_remove',
      entity: 'organizer',
      entityId: organizer.id,
      summary:
        how === 'demote'
          ? `Removed ${fresh.email} from ${organizer.name}; they still run their clubs`
          : `Removed ${fresh.email} from ${organizer.name}`,
      organizerId: organizer.id,
    })
    return { ok: true, kept: how === 'demote' ? 'clubs' : null }
  })

  /** Hands the organiser to another of its members. The owner, or the super admin. */
  router.put('/admin/organizers/:id/owner', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizerOrThrow(params.id!)
    const accounts = await accountsOf(organizer.id)
    assertOrganizerOwner(user, organizer, accounts)

    const userId = typeof ctx.body.userId === 'string' ? ctx.body.userId : ''
    const successor = membersOf(organizer.id, accounts).find((member) => member.id === userId)
    if (!successor) throw badRequest('Only somebody who already helps run this organizer can own it')
    if (successor.id === ownerOf(organizer, accounts)?.id) return { ok: true }

    if (!(await setOrganizerOwner(organizer.id, successor.id, organizer.ownerUserId))) {
      throw badRequest('The owner changed in the meantime. Reload and try again.')
    }
    await record(user, {
      action: 'organizer.owner',
      entity: 'organizer',
      entityId: organizer.id,
      summary: `Handed ${organizer.name} to ${successor.email}`,
      organizerId: organizer.id,
    })
    return { ok: true }
  })

  /**
   * What a helper invitation is for, before anybody acts on it.
   *
   * `mode` tells the page which of three things to offer. It says nothing the
   * holder of the link could not learn by trying it. Under `/auth/` and not
   * `/public/`, for the reason every other preview is: public answers are
   * cached for a minute, with the address in them.
   */
  router.get('/auth/helper-invites/:token', async (_ctx, params) => {
    const invite = await peekHelperInvite(params.token!)
    if (!invite) throw notFound('This invitation has expired or has already been used')
    const decision = helperClaimMode(await anyAccountOnEmail(invite.email), invite.organizerId)
    return {
      organizerName: invite.organizerName,
      email: invite.email,
      expiresAt: invite.expiresAt,
      ...('refused' in decision ? { refused: decision.refused } : { mode: decision.mode }),
    }
  })

  /**
   * Taking one up.
   *
   * The mode is worked out again from the address as it is now, not taken from
   * the page, and everything is checked before the link is spent, so that a
   * weak password or the wrong session does not burn it. Each mode's account
   * write is conditional on the account still being what decided the mode.
   */
  router.post('/auth/claim-helper', async (ctx) => {
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : ''
    const invite = await peekHelperInvite(token)
    if (!invite) throw badRequest('This invitation has expired or has already been used')
    const organizer = await organizers.readConsistently(invite.organizerId)
    if (!organizer) throw notFound('That organizer no longer exists')

    const existing = await anyAccountOnEmail(invite.email)
    const decision = helperClaimMode(existing, organizer.id)
    if ('refused' in decision) throw badRequest(decision.refused)

    const spent = 'This invitation has expired or has already been used'
    const joined = async (actor: AuthUser) =>
      record(actor, {
        action: 'organizer.helper_join',
        entity: 'organizer',
        entityId: organizer.id,
        summary: `Joined ${organizer.name} as a helper`,
        organizerId: organizer.id,
      })

    if (decision.mode === 'signin') {
      // The link proves the inbox; the session proves the password. Both are
      // needed to change what somebody's existing account is.
      if (!ctx.headers['authorization']) {
        throw badRequest('There is already an account with this email. Sign in with it, then open the link again.')
      }
      const user = await ctx.user()
      if (user.id !== existing!.id) {
        throw badRequest('This invitation was sent to a different email address')
      }
      if (!(await consumeHelperInvite(token))) throw badRequest(spent)
      if (!(await makeClubManagerHelper(user.id, organizer.id))) {
        throw badRequest('Your account changed in the meantime. Ask for a new invitation.')
      }
      const updated = (await getUserById(user.id)) ?? user
      await joined(updated)
      return { user: toPublicUser(updated) }
    }

    if (decision.mode === 'reactivate') {
      // The account comes back with its own password and no session: whoever
      // opened the link signs in afterwards like anybody else, which is the
      // proof that it is the person and not the owner who holds the link too.
      if (!(await consumeHelperInvite(token))) throw badRequest(spent)
      if (!(await reactivateHelper(existing!.id, organizer.id))) {
        throw badRequest('That account changed in the meantime. Ask for a new invitation.')
      }
      const account = (await getUserById(existing!.id))!
      await joined(account)
      return { reactivated: true }
    }

    try {
      assertPasswordStrength(ctx.body.password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }
    const salt = generateSalt()
    const passwordHash = await hashPassword(ctx.body.password as string, salt)

    if (!(await consumeHelperInvite(token))) throw badRequest(spent)
    const now = new Date().toISOString()
    const account: AuthUser = {
      id: generateId(),
      email: invite.email,
      displayName:
        typeof ctx.body.displayName === 'string' && ctx.body.displayName.trim()
          ? ctx.body.displayName.trim()
          : undefined,
      role: 'organizer',
      organizerId: organizer.id,
      organizerSince: now,
      passwordHash,
      salt,
      createdAt: now,
      isActive: true,
    }
    // Unconditional, as the organiser's and the referee's claims are: the
    // address was checked a moment ago, and the same link cannot be spent
    // twice. Two different organisers' links to one new address, taken up in
    // the same second, would still open two accounts; that race is shared
    // with every claim route and is not closed here.
    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: account }))

    await joined(account)
    const session = await createSession(account.id, ctx.userAgent, ctx.sourceIp)
    return { user: toPublicUser(account), token: session.token, expiresAt: session.expiresAt }
  })
}
