import { forbidden } from './http.js'
import { managesTeam } from './auth.js'
import type { AuthUser, Team } from './types.js'

/**
 * Who among a club's managers is in charge of the others.
 *
 * A club can be run by several people — a coach, an assistant, a secretary —
 * and they are not equals: somebody has to be able to bring a helper in and
 * take one off again, and if every manager could do that, any one of them
 * could remove all the others. So one of them is the head manager, and only the
 * head invites, removes, and hands the role on. Everything else about the club
 * — the squad, the crest, entering competitions — every manager may do, exactly
 * as before.
 *
 * `headManagerId` on the club names the head once somebody has been named.
 * Absent — which is every club in the database when this was written — means
 * the first id in `managerUserIds`, which is the person who took the club on
 * first. So nothing is migrated, and a club with one manager has a head without
 * anybody deciding it.
 *
 * A stored id that is no longer on the list reads the same way as an absent
 * one. `unlinkManagerFromTeam` clears the field when it takes the head off, but
 * that is a second write and can fail, and a head who is no longer a manager
 * must never be the answer.
 */
export function headManagerOf(team: Pick<Team, 'managerUserIds' | 'headManagerId'>): string | null {
  const ids = Array.isArray(team.managerUserIds) ? team.managerUserIds : []
  const named = typeof team.headManagerId === 'string' ? team.headManagerId : ''
  if (named && ids.includes(named)) return named
  return ids[0] ?? null
}

export function isHeadManager(user: AuthUser, team: Team): boolean {
  return headManagerOf(team) === user.id
}

/**
 * The caller is one of this club's managers — by the list, and nothing else.
 *
 * Not `assertManagesTeam`, which also lets in the owning organizer of a club
 * nobody runs and the super admin. The routes behind this one are about the
 * club's own people, and they answer with those people's addresses: the
 * organizer has `/admin/teams/:id/managers` for that, guarded by ownership of
 * the club rather than membership of it.
 */
export function assertIsClubManager(user: AuthUser, team: Team): void {
  if (!managesTeam(user, team)) throw forbidden('You do not run this club')
}

export function assertHeadManager(user: AuthUser, team: Team): void {
  assertIsClubManager(user, team)
  if (!isHeadManager(user, team)) {
    throw forbidden('Only the head manager of this club can do that')
  }
}

/**
 * Whether one manager may take another — or themselves — off a club.
 *
 * Returns the reason it may not, or null. A helper may leave but not remove
 * anybody. The head may remove any helper, and may leave only once nobody else
 * is left to run the club: with others still on it the role would fall to
 * whoever happens to be first on the list, which is a decision nobody made.
 * Handing the role on first is one click and says who it goes to.
 */
export function whyManagerMayNotRemove(
  user: AuthUser,
  team: Pick<Team, 'id' | 'managerUserIds' | 'headManagerId'>,
  targetId: string,
): string | null {
  if (!managesTeam(user, team)) return 'You do not run this club'
  const ids = team.managerUserIds ?? []
  if (!ids.includes(targetId)) return 'That person does not run this club'

  const head = headManagerOf(team)
  if (targetId === user.id) {
    if (head === user.id && ids.length > 1) {
      return 'Hand the club to another manager before you leave it'
    }
    return null
  }
  if (head !== user.id) return 'Only the head manager can remove a manager'
  return null
}

/**
 * The condition that says "the caller is still the head", in the shape the
 * club was read in.
 *
 * A guard computed from the record the same request read asserts nothing on
 * its own: a head who handed the club on in another tab a second ago was the
 * head in that read. So every write only the head may make carries this, and
 * it is written against what the read actually found — a named head, or the
 * first place on the list with either no name stored or a stale one — because
 * `contains` cannot compare one attribute against another.
 */
export type Condition = {
  expression: string
  names: Record<string, string>
  values: Record<string, unknown>
}

export function headCondition(
  team: Pick<Team, 'managerUserIds' | 'headManagerId'>,
  userId: string,
): Condition {
  const names = { '#head': 'headManagerId', '#managers': 'managerUserIds' }
  const stored = typeof team.headManagerId === 'string' ? team.headManagerId : ''
  const ids = team.managerUserIds ?? []

  if (stored && ids.includes(stored)) {
    return {
      expression: '#head = :headActor AND contains(#managers, :headActor)',
      names,
      values: { ':headActor': userId },
    }
  }
  if (stored) {
    return {
      // The stale name must still be off the list: somebody taken off and
      // invited back would otherwise be the head again the moment they return.
      expression:
        '#managers[0] = :headActor AND #head = :staleHead AND NOT contains(#managers, :staleHead)',
      names,
      values: { ':headActor': userId, ':staleHead': stored },
    }
  }
  return {
    expression: '#managers[0] = :headActor AND attribute_not_exists(#head)',
    names,
    values: { ':headActor': userId },
  }
}

/**
 * The condition that the head is still who the read found, whoever that is.
 *
 * For a helper leaving: nothing is asked of the caller, but the head must not
 * have moved underneath them. With a head named and on the list, the name is
 * asserted. Otherwise the head is whoever is first, and the removal's own
 * check of the leaver's index already fails if the list shifted — so only the
 * stored field has to be pinned, absent or stale as it was read.
 */
export function headUnchanged(team: Pick<Team, 'managerUserIds' | 'headManagerId'>): Condition {
  const stored = typeof team.headManagerId === 'string' ? team.headManagerId : ''
  const ids = team.managerUserIds ?? []
  if (stored && ids.includes(stored)) {
    return {
      expression: '#head = :readHead AND contains(#managers, :readHead)',
      names: { '#head': 'headManagerId', '#managers': 'managerUserIds' },
      values: { ':readHead': stored },
    }
  }
  if (stored) {
    return {
      expression: '#head = :readHead AND NOT contains(#managers, :readHead)',
      names: { '#head': 'headManagerId', '#managers': 'managerUserIds' },
      values: { ':readHead': stored },
    }
  }
  return {
    expression: 'attribute_not_exists(#head)',
    names: { '#head': 'headManagerId' },
    values: {},
  }
}
