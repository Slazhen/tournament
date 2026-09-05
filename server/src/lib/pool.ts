/**
 * Whether a club is in the pool every organiser may search.
 *
 * Two conditions, and the first is the point of the second. A club with a
 * manager is a club with somebody to answer for it: the invitation it receives
 * goes to a person who chose to run it, and that person can take the club back
 * off the list. A club nobody has taken on has no such person — the league that
 * owns it would be answering for a club it may only be storing — so it stays
 * where it is, visible to its own organiser and to the competitions it plays in.
 *
 * Absent means listed, which is the opposite of what the field this replaces
 * meant. `discoverable` was opt-in and almost nobody opted in: the pool was
 * empty and the organiser searching it learnt nothing. What a manager keeps is
 * the ability to say no, and that is `hiddenFromPool`.
 *
 * It is a new field rather than the old one read the other way round, and that
 * is the whole reason it exists. The club form sent `discoverable` on every
 * save, so a manager who edited their crest while the box was unticked has
 * `false` stored without ever having decided anything — read as "hide me", that
 * value would take clubs out of the pool on the strength of a checkbox they
 * never saw. So the old field is left where it is, read by nothing, and the
 * decision is recorded by the control that actually asks for it.
 *
 * Hiding does not reach a competition the club is already in. That is not this
 * function's doing: an organiser sees the clubs in their own seasons through
 * their accepted entries, which this is not consulted for.
 */
export function isInClubPool(team: {
  managerUserIds?: unknown
  hiddenFromPool?: unknown
}): boolean {
  const claimed = Array.isArray(team.managerUserIds) && team.managerUserIds.length > 0
  return claimed && team.hiddenFromPool !== true
}
